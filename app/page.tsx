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
}

type Panel = 'none' | 'time' | 'form'

const QUICK_REPLIES = ['今週は?', '明日は?', 'このあと空いてる?']

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
  const [panel, setPanel] = useState<Panel>('none')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState(todayDateString)
  const [pickerStart, setPickerStart] = useState('')
  const [pickerEnd, setPickerEnd] = useState('')
  const [formName, setFormName] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formDetails, setFormDetails] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formDate, setFormDate] = useState(todayDateString)
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries])

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

  async function sendMessage(messageText: string) {
    if (loading || messageText.trim().length === 0) return

    const updatedEntries: ChatEntry[] = [
      ...entries,
      { role: 'user', text: messageText, timestamp: new Date().toISOString() },
    ]
    setEntries(updatedEntries)
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
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
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
    setFormTitle('')
    setFormDetails('')
    setFormUrl('')
    setPanel('none')
  }

  function submitForm() {
    if (formName.trim().length === 0 || formTitle.trim().length === 0) return

    const lines = [`依頼者: ${formName}`, `件名: ${formTitle}`]
    const datetimePhrase = buildDateTimePhrase(formDate, formStart, formEnd)
    if (datetimePhrase) lines.push(`日時: ${datetimePhrase}`)
    lines.push(`詳細: ${formDetails.trim() ? formDetails : '詳細なし'}`)
    if (formUrl.trim()) lines.push(`URL: ${formUrl}`)

    sendMessage(lines.join('\n'))

    setFormName('')
    setFormTitle('')
    setFormDetails('')
    setFormUrl('')
    setFormDate(todayDateString())
    setFormStart('')
    setFormEnd('')
    setPanel('none')
  }

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
              disabled={formName.trim().length === 0 || formTitle.trim().length === 0}
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              今週の予定について
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              カレンダー連携中
            </div>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-xl">{composer}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-slate-950">
      <header className="sticky top-0 z-50 flex-shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-slate-950">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            今週の予定について
          </h1>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            カレンダー連携中
          </div>
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
              <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200 dark:bg-slate-800 dark:ring-slate-700">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-slate-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-zinc-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-3xl">
          {composer}
        </div>
      </div>
    </div>
  )
}
