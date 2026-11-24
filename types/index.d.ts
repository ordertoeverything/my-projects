export type Tab = 'files' | 'chats'

export type Preview =
  | { kind: 'file'; path: string }
  | { kind: 'chat'; id: string }
  | null

export type Progress = { done: number; total: number }

declare module 'claude-code' {
  interface PluginState {
    'my-projects': {
      project: Shaped<string | null>
      folder: Shaped<string>
      tab: Shaped<Tab>
      preview: Shaped<Preview>
      progress: Shaped<Progress>
    }
  }
}
