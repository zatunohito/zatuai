'use client'

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'

type Role = 'user' | 'assistant'

interface ChatEntry {
  role: Role
  text: string
}

export default function Home() {
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries])

  const trimmed = input.trim()

  async function send() {
    if (loading || trimmed.length === 0) return

    const message = trimmed
    setEntries((prev) => [...prev, { role: 'user', text: message }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()

      if (res.ok) {
        setEntries((prev) => [...prev, { role: 'assistant', text: data.answer }])
      } else {
        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `エラーが発生しました${data.error ? `: ${data.error}` : ''}`,
          },
        ])
      }
    } catch {
      setEntries((prev) => [
        ...prev,
        { role: 'assistant', text: 'エラーが発生しました' },
      ])
    } finally {
      setLoading(false)
    }
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {entries.length === 0 && (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
              メッセージを送信してください
            </p>
          )}
          {entries.map((entry, i) => (
            <div key={i} className="mb-4">
              <span
                className={
                  entry.role === 'user'
                    ? 'text-xs font-semibold text-blue-600 dark:text-blue-400'
                    : 'text-xs font-semibold text-emerald-600 dark:text-emerald-400'
                }
              >
                {entry.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                {entry.text}
              </p>
            </div>
          ))}
          {loading && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">思考中...</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={loading || trimmed.length === 0}
            className="self-end rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            送信
          </button>
        </form>
      </div>
    </div>
  )
}
