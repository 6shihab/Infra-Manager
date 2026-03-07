import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes (data considered fresh for 5min, skips network fetch)
      gcTime: 1000 * 60 * 30, // 30 minutes (old data kept in cache for rapid back-navigation)
      refetchOnWindowFocus: false, // Prevents sudden UI leaps when switching tabs
      retry: 1
    },
  },
})

// Enable dark mode by default on body
document.body.classList.add('dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
