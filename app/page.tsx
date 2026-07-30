'use client'

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

type Role = 'user' | 'assistant'

interface EventCard {
  day: string
  time: string
  title: string
  category: string
}

interface ChatEntry {
  role: Role
  text: string
  timestamp: string
  events?: EventCard[]
  choices?: string[]
}

type Panel = 'none' | 'time' | 'form'

const QUICK_REPLIES = ['今週は?', '明日は?', 'このあと空いてる?']

const EFFORT_LEVELS: Array<{ label: string; value: 'none' | 'high' | 'max' }> = [
  { label: '高速', value: 'none' },
  { label: '高', value: 'high' },
  { label: '最高', value: 'max' },
]

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function buildDateTimePhrase(date: string, start: string, end: string) {
  if (!date && !start && !end) return ''
  let phrase = date
  if (start) phrase += `${phrase ? 'の' : ''}${start}`
  if (end) phrase += `から${end}まで`
  return phrase
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="rounded bg-zinc-200 px-1 py-0.5 text-xs font-mono text-rose-600 dark:bg-zinc-700 dark:text-rose-400"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className={`block overflow-x-auto rounded-lg bg-zinc-200 p-3 text-xs font-mono text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200 ${className ?? ''}`}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children }) {
    return <pre className="mt-2 mb-2 overflow-x-auto rounded-lg first:mt-0 last:mb-0">{children}</pre>
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>
  },
  ul({ children }) {
    return <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
  },
  ol({ children }) {
    return <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
  },
  li({ children }) {
    return <li className="mb-1 last:mb-0">{children}</li>
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-blue-600 underline decoration-zinc-300 underline-offset-2 hover:text-blue-500 dark:text-blue-400 dark:decoration-zinc-600"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  },
  table({ children }) {
    return (
      <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-200 last:mb-0 dark:border-zinc-700">
        <table className="min-w-full text-left text-xs">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th className="border-b border-zinc-200 bg-zinc-100 px-3 py-2 font-semibold dark:border-zinc-700 dark:bg-zinc-700">
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">{children}</td>
    )
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-4 text-lg font-bold first:mt-0 last:mb-0">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-3 text-base font-bold first:mt-0 last:mb-0">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0 last:mb-0">{children}</h3>
  },
  blockquote({ children }) {
    return (
      <blockquote className="mb-2 border-l-4 border-zinc-300 pl-4 italic text-zinc-600 last:mb-0 dark:border-zinc-600 dark:text-zinc-400">
        {children}
      </blockquote>
    )
  },
  hr() {
    return <hr className="my-3 border-zinc-200 dark:border-zinc-700" />
  },
}

export default function Home() {
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [choiceFocusIndex, setChoiceFocusIndex] = useState(0)
  const [choicesHidden, setChoicesHidden] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [panel, setPanel] = useState<Panel>('none')
  const [menuOpen, setMenuOpen] = useState(false)
  const [effortIndex, setEffortIndex] = useState(2)
  const [auditEnabled, setAuditEnabled] = useState(false)
  const [pickerDate, setPickerDate] = useState(todayDateString)
  const [pickerStart, setPickerStart] = useState('')
  const [pickerEnd, setPickerEnd] = useState('')
  const [formName, setFormName] = useState('')
  const [formContact, setFormContact] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formDetails, setFormDetails] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formDate, setFormDate] = useState(todayDateString)
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const requestStartedAtRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [entries, scrollToBottom])

  // Ticks the elapsed-seconds counter shown next to the live status label. The
  // origin lives in a ref, set once when the request starts, so the counter
  // stays monotonic even if this effect is torn down and re-created mid-request.
  useEffect(() => {
    if (!loading) return
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - requestStartedAtRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    const saved = window.localStorage.getItem('effortIndex')
    if (saved !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of persisted preference on mount
      setEffortIndex(Number(saved))
    }
  }, [])

  function handleEffortChange(index: number) {
    setEffortIndex(index)
    window.localStorage.setItem('effortIndex', String(index))
  }

  useEffect(() => {
    const saved = window.localStorage.getItem('auditEnabled')
    if (saved !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of persisted preference on mount
      setAuditEnabled(saved === 'true')
    }
  }, [])

  function handleAuditChange(value: boolean) {
    setAuditEnabled(value)
    window.localStorage.setItem('auditEnabled', String(value))
  }

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const handleResize = () => {
      window.scrollTo(0, 0)
      scrollToBottom()
    }

    viewport.addEventListener('resize', handleResize)
    return () => viewport.removeEventListener('resize', handleResize)
  }, [scrollToBottom])

  function handleTextareaFocus() {
    window.setTimeout(scrollToBottom, 300)
  }

  const trimmed = input.trim()

  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  const sendMessage = useCallback(async (messageText: string) => {
    if (loading || messageText.trim().length === 0) return

    const updatedEntries: ChatEntry[] = [
      ...entries,
      { role: 'user', text: messageText, timestamp: new Date().toISOString() },
    ]
    setEntries(updatedEntries)
    requestStartedAtRef.current = Date.now()
    setElapsed(0)
    setStatus(null)
    setStreamingText('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedEntries.map((entry) => ({
            role: entry.role,
            content: entry.text,
          })),
          effort: EFFORT_LEVELS[effortIndex].value,
          audit: auditEnabled,
        }),
      })

      // Errors before the stream starts (rate limit, validation) come back as
      // plain JSON rather than as server-sent events.
      if (!res.ok || !res.body) {
        let detail = ''
        try {
          const data = await res.json()
          if (data.error) detail = `: ${data.error}`
        } catch {
          // keep the generic message
        }
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `エラーが発生しました${detail}`,
            timestamp: new Date().toISOString(),
          },
        ])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done: { answer?: string; events?: EventCard[]; choices?: string[] } | null = null
      let streamError: string | null = null

      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const event = JSON.parse(line.slice(5).trim())
          if (event.type === 'status') {
            setStatus(event.label)
          } else if (event.type === 'partial') {
            setStreamingText((prev) => prev + event.delta)
          } else if (event.type === 'done') {
            done = event
          } else if (event.type === 'error') {
            streamError = event.error
          }
        }
      }

      if (streamError) {
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `エラーが発生しました: ${streamError}`,
            timestamp: new Date().toISOString(),
          },
        ])
      } else {
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: done?.answer ?? '',
            timestamp: new Date().toISOString(),
            events: Array.isArray(done?.events) ? done.events : undefined,
            choices: Array.isArray(done?.choices) ? done.choices : undefined,
          },
        ])
      }
    } catch {
      setEntries((prev) => [
        ...prev,
        { role: 'assistant', text: 'エラーが発生しました', timestamp: new Date().toISOString() },
      ])
    } finally {
      setLoading(false)
      setStatus(null)
      setStreamingText('')
    }
  }, [loading, entries, effortIndex, auditEnabled])

  const lastEntry = entries[entries.length - 1]
  const activeChoices =
    !choicesHidden && lastEntry?.role === 'assistant' && lastEntry.choices && lastEntry.choices.length > 0
      ? lastEntry.choices
      : null

  // Resets the choice card whenever a new message arrives, since choices only
  // ever apply to the latest assistant entry.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reset when a new message (and possibly new choices) arrives
    setChoiceFocusIndex(0)
    setChoicesHidden(false)
  }, [entries.length])

  // Keyboard navigation for the choice card: arrow keys and mouse hover both
  // move the highlighted row (via choiceFocusIndex), Enter sends it, digits
  // jump straight to an option, Escape dismisses. Arrow/digit/Escape are
  // ignored while typing in a text field; Enter is only ignored if that field
  // actually has text in it, so hovering a choice with an empty, focused
  // textarea still lets Enter send the hovered option.
  useEffect(() => {
    if (!activeChoices) return

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (!activeChoices) return
      const target = e.target as HTMLElement
      const isTextField = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT'

      if (e.key === 'Enter') {
        // The textarea normally owns Enter (send the typed reply), so only
        // hand it back here if there is nothing typed — e.g. the user is
        // just hovering a choice with the mouse while the (empty) textarea
        // still happens to hold focus. If they typed something, let their
        // own onKeyDown submit that text instead of hijacking it.
        const typedValue = isTextField ? (target as HTMLTextAreaElement | HTMLInputElement).value : ''
        if (typedValue.trim() !== '') return
        e.preventDefault()
        sendMessage(activeChoices[choiceFocusIndex])
        return
      }

      if (isTextField) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setChoiceFocusIndex((prev) => (prev + 1) % activeChoices.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setChoiceFocusIndex((prev) => (prev - 1 + activeChoices.length) % activeChoices.length)
      } else if (e.key === 'Escape') {
        setChoicesHidden(true)
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (idx < activeChoices.length) {
          e.preventDefault()
          sendMessage(activeChoices[idx])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeChoices, choiceFocusIndex, sendMessage])

  function send() {
    if (loading || trimmed.length === 0) return
    const message = trimmed
    setInput('')
    sendMessage(message)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    send()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function togglePanel(target: Panel) {
    setPanel((current) => (current === target ? 'none' : target))
    setMenuOpen(false)
  }

  function sendQuickReply(text: string) {
    sendMessage(text)
  }

  async function showUpcomingEvents() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/upcoming')
      const data = await res.json()
      if (res.ok) {
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: '直近の予定はこちらです。',
            timestamp: new Date().toISOString(),
            events: Array.isArray(data.events) ? data.events : undefined,
          },
        ])
      } else {
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `エラーが発生しました${data.error ? `: ${data.error}` : ''}`,
            timestamp: new Date().toISOString(),
          },
        ])
      }
    } catch {
      setEntries((prev) => [
        ...prev,
        { role: 'assistant', text: 'エラーが発生しました', timestamp: new Date().toISOString() },
      ])
    } finally {
      setLoading(false)
    }
  }

  function applyTimePicker() {
    const phrase = buildDateTimePhrase(pickerDate, pickerStart, pickerEnd)
    if (!phrase) {
      setPanel('none')
      return
    }
    setInput((prev) => (prev ? `${prev} ${phrase}` : phrase))
    setPanel('none')
  }

  function cancelForm() {
    setFormName('')
    setFormContact('')
    setFormTitle('')
    setFormDetails('')
    setFormUrl('')
    setPanel('none')
  }

  function submitForm() {
    if (formName.trim().length === 0 || formContact.trim().length === 0 || formTitle.trim().length === 0) return

    const lines = [`依頼者: ${formName}`, `連絡先: ${formContact}`, `件名: ${formTitle}`]
    const datetimePhrase = buildDateTimePhrase(formDate, formStart, formEnd)
    if (datetimePhrase) lines.push(`日時: ${datetimePhrase}`)
    lines.push(`詳細: ${formDetails.trim() ? formDetails : '詳細なし'}`)
    if (formUrl.trim()) lines.push(`URL: ${formUrl}`)

    sendMessage(lines.join('\n'))

    setFormName('')
    setFormContact('')
    setFormTitle('')
    setFormDetails('')
    setFormUrl('')
    setFormDate(todayDateString())
    setFormStart('')
    setFormEnd('')
    setPanel('none')
  }

  const effortPanelBig = (
    <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 text-sm text-zinc-700 dark:text-slate-200">
        エフォート <span className="font-semibold">{EFFORT_LEVELS[effortIndex].label}</span>
      </div>
      <div className="relative flex h-5 items-center">
        <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-zinc-200 dark:bg-slate-700" />
        <div
          className="pointer-events-none absolute h-1.5 rounded-full bg-gradient-to-r from-violet-300 to-violet-600 transition-all duration-200"
          style={{ width: `${(effortIndex / (EFFORT_LEVELS.length - 1)) * 100}%` }}
        />
        <div className="pointer-events-none absolute inset-x-0 flex justify-between px-0.5">
          {EFFORT_LEVELS.map((level, levelIndex) => (
            <span
              key={level.value}
              className={`h-1.5 w-1.5 rounded-full ${
                levelIndex <= effortIndex ? 'bg-violet-200' : 'bg-zinc-400 dark:bg-slate-500'
              }`}
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 rounded-full bg-white shadow ring-1 ring-zinc-300 transition-all duration-200 dark:ring-slate-500"
          style={{ left: `${(effortIndex / (EFFORT_LEVELS.length - 1)) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={EFFORT_LEVELS.length - 1}
          step={1}
          value={effortIndex}
          onChange={(e) => handleEffortChange(Number(e.target.value))}
          aria-label="エフォート"
          className="relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent"
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-400 dark:text-slate-500">
        <span>高速</span>
        <span>高精度</span>
      </div>
    </div>
  )

  const effortBarSmall = (
    <div className="mt-2 flex items-center gap-2">
      <span className="flex-shrink-0 text-xs text-zinc-400 dark:text-slate-500">エフォート</span>
      <div className="relative flex h-3 flex-1 items-center">
        <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-zinc-200 dark:bg-slate-700" />
        <div
          className="pointer-events-none absolute h-1 rounded-full bg-gradient-to-r from-violet-300 to-violet-600 transition-all duration-200"
          style={{ width: `${(effortIndex / (EFFORT_LEVELS.length - 1)) * 100}%` }}
        />
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow ring-1 ring-zinc-300 transition-all duration-200 dark:ring-slate-500"
          style={{ left: `${(effortIndex / (EFFORT_LEVELS.length - 1)) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={EFFORT_LEVELS.length - 1}
          step={1}
          value={effortIndex}
          onChange={(e) => handleEffortChange(Number(e.target.value))}
          aria-label="エフォート"
          className="relative z-10 h-3 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent"
        />
      </div>
      <span className="w-8 flex-shrink-0 text-right text-xs text-zinc-400 dark:text-slate-500">
        {EFFORT_LEVELS[effortIndex].label}
      </span>
    </div>
  )

  const auditToggleBig = (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-sm text-zinc-700 dark:text-slate-200">
        回答監査
        <span className="ml-2 text-xs text-zinc-400 dark:text-slate-500">別のAIが回答をチェックします</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={auditEnabled}
        aria-label="回答監査"
        onClick={() => handleAuditChange(!auditEnabled)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
          auditEnabled ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            auditEnabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )

  const auditToggleSmall = (
    <div className="mt-2 flex items-center gap-2">
      <span className="flex-shrink-0 text-xs text-zinc-400 dark:text-slate-500">回答監査</span>
      <button
        type="button"
        role="switch"
        aria-checked={auditEnabled}
        aria-label="回答監査"
        onClick={() => handleAuditChange(!auditEnabled)}
        className={`relative h-4 w-8 flex-shrink-0 rounded-full transition-colors duration-200 ${
          auditEnabled ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${
            auditEnabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )

  const composer = (
    <>
      {panel === 'none' && (
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => sendQuickReply(reply)}
              disabled={loading}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {panel === 'time' && (
        <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
              日付
              <input
                type="date"
                value={pickerDate}
                onChange={(e) => setPickerDate(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
              開始
              <input
                type="time"
                value={pickerStart}
                onChange={(e) => setPickerStart(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
              終了
              <input
                type="time"
                value={pickerEnd}
                onChange={(e) => setPickerEnd(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={applyTimePicker}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              反映
            </button>
            <button
              type="button"
              onClick={() => setPanel('none')}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {panel === 'form' && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
            依頼者名
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
            連絡先（メール・電話番号など）
            <input
              type="text"
              required
              value={formContact}
              onChange={(e) => setFormContact(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
            件名
            <input
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <div>
            <span className="mb-1 block text-xs text-zinc-500 dark:text-slate-400">日時</span>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              <input
                type="time"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              <input
                type="time"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
            詳細
            <textarea
              rows={2}
              value={formDetails}
              onChange={(e) => setFormDetails(e.target.value)}
              className="resize-none rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-slate-400">
            URL（任意）
            <input
              type="text"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitForm}
              disabled={formName.trim().length === 0 || formContact.trim().length === 0 || formTitle.trim().length === 0}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              送信
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex w-full items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 py-1.5 pl-1.5 pr-1.5 focus-within:border-zinc-400 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-slate-500"
      >
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="ツールを開く"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-medium text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            +
          </button>
          {menuOpen && (
            <div className="absolute bottom-11 left-0 z-10 flex w-40 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => togglePanel('time')}
                className="px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                日時を選択
              </button>
              <button
                type="button"
                onClick={() => togglePanel('form')}
                className="px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                予約フォーム
              </button>
            </div>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleTextareaFocus}
          placeholder="メッセージを入力..."
          rows={1}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={loading || trimmed.length === 0}
          aria-label="送信"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-violet-600 dark:hover:bg-violet-500"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </>
  )

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-slate-950">
        <header className="sticky top-0 z-50 flex-shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-slate-950">
          <div className="mx-auto flex w-full max-w-3xl">
            <button
              type="button"
              onClick={showUpcomingEvents}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              直近の予定を見る
            </button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-xl">
            {effortPanelBig}
            {auditToggleBig}
            {composer}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-slate-950">
      <header className="sticky top-0 z-50 flex-shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-slate-950">
        <div className="mx-auto flex w-full max-w-3xl">
          <button
            type="button"
            onClick={showUpcomingEvents}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            直近の予定を見る
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {entries.map((entry, i) => (
            <div
              key={i}
              className={`flex flex-col gap-3 ${entry.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`flex w-full gap-3 ${entry.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    entry.role === 'user'
                      ? 'bg-blue-100 text-blue-700 dark:bg-violet-500/20 dark:text-violet-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  }`}
                >
                  {entry.role === 'user' ? 'You' : 'AI'}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                    entry.role === 'user'
                      ? 'bg-zinc-800 text-white dark:bg-violet-600 dark:text-white'
                      : 'bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
                  }`}
                >
                  {entry.role === 'assistant' ? (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {entry.text}
                      </ReactMarkdown>
                      {entry.events && entry.events.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2">
                          {entry.events.map((ev, evIndex) => (
                            <div
                              key={evIndex}
                              className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200 dark:bg-slate-700/60 dark:ring-slate-600"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex-shrink-0 whitespace-nowrap text-xs font-medium text-zinc-500 dark:text-slate-300">
                                  {ev.day} {ev.time}
                                </span>
                                <span className="truncate text-sm text-zinc-800 dark:text-slate-100">
                                  {ev.title}
                                </span>
                              </div>
                              <span className="flex-shrink-0 rounded-md bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-violet-500/20 dark:text-violet-300">
                                {ev.category}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {entry.choices && entry.choices.length > 0 && i === entries.length - 1 && !choicesHidden && (
                        <>
                          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
                            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-slate-700">
                              <span className="text-xs font-medium text-zinc-500 dark:text-slate-400">
                                選択してください
                              </span>
                              <button
                                type="button"
                                onClick={() => setChoicesHidden(true)}
                                aria-label="閉じる"
                                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <div>
                              {entry.choices.map((choice, choiceIndex) => (
                                <button
                                  key={choiceIndex}
                                  type="button"
                                  onClick={() => sendMessage(choice)}
                                  onMouseEnter={() => setChoiceFocusIndex(choiceIndex)}
                                  disabled={loading}
                                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    choiceFocusIndex === choiceIndex
                                      ? 'bg-zinc-100 dark:bg-slate-700'
                                      : 'hover:bg-zinc-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-zinc-300 text-[11px] text-zinc-500 dark:border-slate-600 dark:text-slate-400">
                                    {choiceIndex + 1}
                                  </span>
                                  <span className="flex-1 text-zinc-800 dark:text-slate-100">{choice}</span>
                                  {choiceFocusIndex === choiceIndex && (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-zinc-400 dark:text-slate-500">
                                      <path d="M9 10l-4 4 4 4" />
                                      <path d="M20 4v7a4 4 0 0 1-4 4H5" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                              <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 dark:border-slate-700">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Dismiss the card so it's unmistakable that something
                                    // happened, then hand focus to the free-text input.
                                    setChoicesHidden(true)
                                    textareaRef.current?.focus()
                                  }}
                                  className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-700 dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                  その他
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setChoicesHidden(true)}
                                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                  スキップ
                                </button>
                              </div>
                            </div>
                          </div>
                          <p className="mt-1.5 text-center text-[11px] text-zinc-400 dark:text-slate-500">
                            ↑↓で移動 ・ Enterで選択 ・ 数字キーでも選択可
                          </p>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{entry.text}</p>
                  )}
                </div>
              </div>
              <span
                className={`px-11 text-xs text-zinc-400 dark:text-zinc-500 ${entry.role === 'user' ? 'pr-11 pl-0 text-right' : ''}`}
              >
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                AI
              </div>
              <div className="max-w-[85%] rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200 dark:bg-slate-800 dark:ring-slate-700 sm:max-w-[80%]">
                {streamingText && (
                  <div className="text-sm leading-relaxed text-zinc-800 dark:text-slate-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {streamingText}
                    </ReactMarkdown>
                  </div>
                )}
                <div className={`flex items-center gap-2 ${streamingText ? 'mt-2' : ''}`}>
                  <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                  <span
                    key={status}
                    className="animate-[fadeIn_200ms_ease-out] text-sm text-zinc-700 dark:text-slate-200"
                  >
                    {status ?? '考えています'}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-400 dark:text-slate-500">
                    {elapsed}秒
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-zinc-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-3xl">
          {composer}
          {effortBarSmall}
          {auditToggleSmall}
        </div>
      </div>
    </div>
  )
}
