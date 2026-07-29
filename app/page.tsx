'use client'

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

type Role = 'user' | 'assistant'

interface ChatEntry {
  role: Role
  text: string
  timestamp: string
}

type Panel = 'none' | 'time' | 'form'

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
          { role: 'assistant', text: data.answer, timestamp: new Date().toISOString() },
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="flex-shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-white dark:bg-zinc-200 dark:text-zinc-900">
            AI
          </div>
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            AI Chat
          </h1>
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {entries.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-zinc-400 dark:text-zinc-500"
                >
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                メッセージを送信してください
              </p>
            </div>
          )}

          {entries.map((entry, i) => (
            <div
              key={i}
              className={`flex flex-col gap-3 ${entry.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`flex w-full gap-3 ${entry.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    entry.role === 'user'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  }`}
                >
                  {entry.role === 'user' ? 'You' : 'AI'}
                </div>

                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    entry.role === 'user'
                      ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800'
                  }`}
                >
                  {entry.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {entry.text}
                    </ReactMarkdown>
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
              <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500 [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => togglePanel('time')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                panel === 'time'
                  ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              日時を選択
            </button>
            <button
              type="button"
              onClick={() => togglePanel('form')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                panel === 'form'
                  ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              予約フォーム
            </button>
          </div>

          {panel === 'time' && (
            <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  日付
                  <input
                    type="date"
                    value={pickerDate}
                    onChange={(e) => setPickerDate(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  開始
                  <input
                    type="time"
                    value={pickerStart}
                    onChange={(e) => setPickerStart(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  終了
                  <input
                    type="time"
                    value={pickerEnd}
                    onChange={(e) => setPickerEnd(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
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
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}

          {panel === 'form' && (
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                依頼者名
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                件名
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </label>
              <div>
                <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">日時</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                  <input
                    type="time"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                  <input
                    type="time"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                </div>
              </div>
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                詳細
                <textarea
                  rows={2}
                  value={formDetails}
                  onChange={(e) => setFormDetails(e.target.value)}
                  className="resize-none rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                URL（任意）
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
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
          className="flex w-full items-end gap-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={loading || trimmed.length === 0}
            className="flex-shrink-0 rounded-xl bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            送信
          </button>
        </form>
        </div>
      </div>
    </div>
  )
}
