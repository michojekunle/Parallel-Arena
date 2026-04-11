'use client'

import { useEffect, useRef } from 'react'
import { LogEntry } from '@/lib/types'

interface BattleLogProps {
  entries: LogEntry[]
}

const TYPE_COLORS: Record<LogEntry['type'], string> = {
  action:  '#ffffff',
  resolve: '#FDBA74',
  attack:  '#EE0000',
  heal:    '#26D962',
  death:   '#EE0000',
  join:    '#3396FF',
  system:  '#26D962',
}

const TYPE_PREFIX: Record<LogEntry['type'], string> = {
  action:  '>',
  resolve: '⚡',
  attack:  '💥',
  heal:    '💚',
  death:   '☠',
  join:    '+',
  system:  '◆',
}

export function BattleLog({ entries }: BattleLogProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div className="bg-black border-t border-[#1a1a1a]">
      <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-b border-[#1a1a1a]">
        <span className="text-[9px] text-[#444] uppercase tracking-widest font-bold">Battle Log</span>
        <span className="text-[9px] font-mono text-[#333]">{entries.length} events</span>
      </div>

      <div className="h-32 overflow-y-auto px-4 sm:px-6 py-2">
        {entries.length === 0 && (
          <div className="text-[9px] font-mono text-[#333] mt-1">Awaiting events...</div>
        )}
        {entries.map(entry => (
          <div
            key={entry.id}
            className="text-[9px] font-mono flex items-center gap-1.5 py-0.5 hover:bg-[#0a0a0a] transition-colors"
          >
            <span className="text-[#333] shrink-0">[R{entry.round}]</span>
            <span className="shrink-0" style={{ color: TYPE_COLORS[entry.type] }}>
              {TYPE_PREFIX[entry.type]}
            </span>
            <span style={{ color: TYPE_COLORS[entry.type] }} className="flex-1 min-w-0 truncate">
              {entry.message}
            </span>
            {entry.txHash && (
              <a
                href={`https://testnet.monadexplorer.com/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#3396FF] hover:underline shrink-0 text-[8px]"
              >
                {entry.txHash.slice(0, 8)}…
              </a>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
