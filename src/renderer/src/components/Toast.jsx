import React from 'react'

const COLORS = {
  success: 'bg-green-700 border-green-500',
  error:   'bg-red-800   border-red-600',
  warn:    'bg-yellow-700 border-yellow-500',
}

export default function Toast({ msg, type = 'success' }) {
  return (
    <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg border text-sm text-white shadow-xl ${COLORS[type]}`}>
      {msg}
    </div>
  )
}
