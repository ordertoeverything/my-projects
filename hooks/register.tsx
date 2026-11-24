import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Preview, Progress, Tab } from '../types'

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

const PANE = 'my-projects'
const TITLE = 'My Projects'
const STORE_KEY = 'chat-index-1'
const TAIL_BYTES = 512 * 1024
const HEAD_BYTES = 64 * 1024
const MAX_ROWS = 60
const PREVIEW_CHARS = 2500

// Your own choices, from the mod settings (userConfig in plugin.json). All optional.
type Config = {
  projectsFolder: string // the folder that holds your projects; blank = "Projects" if you have one, else your main folder
  extraFolders: string[] // other folders that also count as projects
  codes: Record<string, string[]> // extra title words per project, e.g. TECH for "Tech and Systems"
}
let config: Config = { projectsFolder: '', extraFolders: [], codes: {} }

const listOf = (v: unknown) =>
  String(v ?? '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)

// "Tech and Systems = TECH; Website = WEB, Homepage" becomes { 'Tech and Systems': ['TECH'], Website: ['WEB', 'Homepage'] }
function parseCodes(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const part of String(v ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at < 1) continue
    const name = part.slice(0, at).trim()
    const words = listOf(part.slice(at + 1))
    if (name && words.length) out[name] = words
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Look: same family as Everything in This Chat
// ---------------------------------------------------------------------------------------------

// Rainbow order, top to bottom; projects take these in turn.
const RAINBOW = [
  '#E5484D', '#F0643C', '#E39B5B', '#D4A000', '#7CB518', '#2E9E5B',
  '#12A594', '#1C9AD6', '#3A6FF0', '#5B5FD6', '#8E5BD9', '#C2417A',
]
const GRAY = '#9CA3AF'
const FONT = '-apple-system, Helvetica, Arial, sans-serif'

const ICONS: Record<string, string> = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  chat: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1z',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
}

function iconSvg(key: string, color: string): string {
  const d = ICONS[key] ?? ICONS.file!
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    d.split(' M').map((p, i) => `<path d="${i ? 'M' : ''}${p}"/>`).join('') +
    `</svg>`
  )
}

const CHIP: Record<string, string> = {
  MD: '#5B5FD6', HTML: '#E07A5F', HTM: '#E07A5F', CSS: '#E07A5F', JS: '#E07A5F', TS: '#E07A5F', TSX: '#E07A5F',
  PNG: '#2E9E5B', JPG: '#2E9E5B', JPEG: '#2E9E5B', GIF: '#2E9E5B', SVG: '#2E9E5B', WEBP: '#2E9E5B',
  PDF: '#D64545', DOCX: '#2B579A', DOC: '#2B579A', CSV: '#1F8A4C', XLSX: '#1F8A4C', JSON: '#7A6A58',
  MP4: '#8E5BD9', MOV: '#8E5BD9', MP3: '#8E5BD9', M4A: '#8E5BD9', ZIP: '#7A6A58', TXT: '#6B7280',
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function chipSvg(tag: string): string {
  const t = esc(tag.slice(0, 5))
  const c = CHIP[tag] ?? '#6B7280'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 13" width="32" height="13">` +
    `<rect x="0.5" y="0.5" width="31" height="12" rx="6" fill="${c}"/>` +
    `<text x="16" y="9.2" text-anchor="middle" font-family="${FONT}" font-size="7.2" font-weight="700" letter-spacing="0.3" fill="#ffffff">${t}</text>` +
    `</svg>`
  )
}

const SPACER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 8" width="4" height="8"><rect width="4" height="8" fill="#ffffff" fill-opacity="0"/></svg>'

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

const projectAtom = atom({ plugin: 'my-projects', key: 'project' } as const, null as string | null, { shape: 'p-1' })
const folderAtom = atom({ plugin: 'my-projects', key: 'folder' } as const, '', { shape: 'f-1' })
const tabAtom = atom({ plugin: 'my-projects', key: 'tab' } as const, 'chats' as Tab, { shape: 't-1' })
const previewAtom = atom({ plugin: 'my-projects', key: 'preview' } as const, null as Preview, { shape: 'v-1' })
const progressAtom = atom({ plugin: 'my-projects', key: 'progress' } as const, { done: 0, total: 0 } as Progress, {
  shape: 'g-1',
})

type Chat = {
  id: string
  mtime: number
  size: number
  title: string
  lastPrompt: string
  lastReply: string
  touched: string[]
}

let index: Record<string, Chat> = {}
let projects: string[] = []
let indexing = false
let root = ''
let projectsDir = '' // relative to root; '' means the main folder itself

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const when = (ms: number) => {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const typeOf = (name: string) => (/\.([A-Za-z0-9]+)$/.exec(name)?.[1] ?? '').toUpperCase()
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

function colorFor(project: string): string {
  const i = Math.max(0, projects.indexOf(project))
  return RAINBOW[i % RAINBOW.length]!
}

async function findRoot($: EngineInterface): Promise<string> {
  if (!root) root = String(await $.session.root())
  return root
}

function projectPath(name: string): string {
  if (config.extraFolders.includes(name) || projectsDir === '') return `${root}/${name}`
  return `${root}/${projectsDir}/${name}`
}

function titleMatches(title: string, project: string): boolean {
  const edge = (w: string, flags: string) => new RegExp(`(^|[^A-Za-z])${escapeRe(w)}([^A-Za-z]|$)`, flags)
  if (edge(project, 'i').test(title)) return true // the folder's own name, any capitals
  return (config.codes[project] ?? []).some(w => edge(w, '').test(title)) // your codes, exact capitals
}

function chatsFor(project: string) {
  const all = Object.values(index).sort((a, b) => b.mtime - a.mtime)
  const named = all.filter(c => titleMatches(c.title, project))
  const namedIds = new Set(named.map(c => c.id))
  const worked = all.filter(c => !namedIds.has(c.id) && c.touched.includes(project))
  return { named, worked }
}

async function loadProjects($: EngineInterface) {
  const base = await findRoot($)
  const wanted = config.projectsFolder.replace(/^\/+|\/+$/g, '')
  if (wanted) projectsDir = wanted
  else projectsDir = (await $.fs.exists(`${base}/Projects`).catch(() => false)) ? 'Projects' : ''
  const here = projectsDir ? `${base}/${projectsDir}` : base
  const list = await $.fs.list(here).catch(() => [])
  const dirs = list
    .filter(e => e.kind === 'dir' && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => e.name)
    .filter(n => n !== projectsDir)
  for (const extra of config.extraFolders) {
    if (!dirs.includes(extra) && (await $.fs.exists(`${base}/${extra}`).catch(() => false))) dirs.push(extra)
  }
  projects = dirs.sort((a, b) => a.localeCompare(b))
}

async function chatsFolder($: EngineInterface): Promise<string | null> {
  const info = await Promise.resolve($.session.info()).catch(() => null)
  const path = (info as { transcriptPath?: string } | null)?.transcriptPath
  if (!path) return null
  return path.replace(/[\\/][^\\/]*$/, '')
}

function parseChunk(text: string, chat: Chat, known: Set<string>, isTail: boolean) {
  const lines = text.split('\n')
  if (isTail) lines.shift() // the first line of a tail read is usually cut
  for (const line of lines) {
    if (line.length === 0) continue
    if (line.startsWith('{"type":"custom-title"')) {
      const m = /"customTitle":"((?:[^"\\]|\\.)*)"/.exec(line)
      if (m && m[1] !== '') chat.title = JSON.parse(`"${m[1]}"`)
      continue
    }
    if (line.startsWith('{"type":"last-prompt"')) {
      const m = /"lastPrompt":"((?:[^"\\]|\\.)*)"/.exec(line)
      if (m) chat.lastPrompt = clip(JSON.parse(`"${m[1]}"`), 240)
      continue
    }
    if (line.includes('"type":"assistant"') && line.includes('"type":"text"')) {
      try {
        const row = JSON.parse(line)
        const parts = row?.message?.content
        if (Array.isArray(parts)) {
          const t = parts.filter((p: any) => p?.type === 'text').map((p: any) => String(p.text ?? '')).join(' ').trim()
          if (t) chat.lastReply = clip(t, 500)
        }
      } catch {
        // a cut line, skip it
      }
    }
  }
  const sub = projectsDir ? `(?:${escapeRe(projectsDir)}/)?` : ''
  const re = new RegExp(`${escapeRe(root)}/${sub}([^/"\\\\]+)/`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[1] ?? ''
    if (known.has(name) && !chat.touched.includes(name)) chat.touched.push(name)
  }
}

async function readChat($: EngineInterface, folder: string, id: string, size: number, mtime: number): Promise<Chat> {
  const chat: Chat = { id, mtime, size, title: '', lastPrompt: '', lastReply: '', touched: [] }
  const known = new Set(projects)
  const path = `${folder}/${id}.jsonl`
  const offset = Math.max(0, size - TAIL_BYTES)
  const tail = String(await $.fs.read(path, { offset, length: size - offset }))
  parseChunk(tail, chat, known, offset > 0)
  if (!chat.title && offset > 0) {
    const head = String(await $.fs.read(path, { offset: 0, length: Math.min(size, HEAD_BYTES) }))
    parseChunk(head, chat, known, false)
  }
  if (!chat.title) chat.title = chat.lastPrompt ? clip(chat.lastPrompt, 60) : 'Untitled chat'
  return chat
}

async function buildIndex($: EngineInterface) {
  if (indexing) return
  indexing = true
  try {
    const folder = await chatsFolder($)
    if (!folder) return
    const saved = (await $.store.get(STORE_KEY)) as Record<string, Chat> | undefined
    if (saved && Object.keys(index).length === 0) index = saved
    const entries = (await $.fs.list(folder)).filter(e => e.kind === 'file' && e.name.endsWith('.jsonl'))
    const todo = entries
      .filter(e => {
        const id = e.name.slice(0, -6)
        const have = index[id]
        return !have || have.mtime !== e.mtimeMs || have.size !== e.size
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    const live = new Set(entries.map(e => e.name.slice(0, -6)))
    for (const id of Object.keys(index)) if (!live.has(id)) delete index[id]
    if (todo.length === 0) return
    await update($, progressAtom, () => ({ done: 0, total: todo.length }))
    let done = 0
    for (let i = 0; i < todo.length; i += 8) {
      const batch = todo.slice(i, i + 8)
      const rows = await Promise.all(
        batch.map(e => readChat($, folder, e.name.slice(0, -6), e.size, e.mtimeMs).catch(() => null)),
      )
      for (const row of rows) if (row) index[row.id] = row
      done += batch.length
      await update($, progressAtom, () => ({ done, total: todo.length }))
    }
    await $.store.set(STORE_KEY, index).catch(() => undefined)
    $.ui.invalidate('ui.render')
  } finally {
    indexing = false
  }
}

async function openOnMac($: EngineInterface, args: string[], what: string) {
  const r = await $.process.run(['open', ...args]).catch(() => null)
  if (!r || r.exitCode !== 0) await $.ui.toast('Could not open ' + what)
}

async function openPane($: EngineInterface) {
  await loadProjects($)
  await $.ui.open({ id: PANE, title: TITLE })
  void buildIndex($)
}

// ---------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------

export const register: Register = (on, options) => {
  config = {
    projectsFolder: String(options?.projectsFolder ?? ''),
    extraFolders: listOf(options?.extraFolders),
    codes: parseCodes(options?.titleCodes),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'projects', description: 'Open My Projects: files and chats for each project' })
    return next(e)
  })

  on('command.run', { command: 'projects' }, async $ => {
    await openPane($)
    return { text: 'My Projects opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    try {
      const isDesk = e.surface !== 'terminal'
      const project = await read($, projectAtom)
      const folder = await read($, folderAtom)
      const tab = await read($, tabAtom)
      const preview = await read($, previewAtom)
      const progress = await read($, progressAtom)
      if (projects.length === 0) await loadProjects($)

      const go = (fn: () => Promise<unknown>) => () => void fn()
      const draw = (source: string, alt: string, width: number, height: number) =>
        isDesk && Svg ? <Svg source={source} alt={alt} width={width} height={height} /> : null
      const gap = () => draw(SPACER, 'space', 4, 8)
      const icon = (key: string, color: string, alt: string) =>
        isDesk && Svg ? draw(iconSvg(key, color), alt, 18, 18) : <Text color={color}>●</Text>

      // An outlined, plain button like "Collapse all" in Everything in This Chat.
      const pill = (key: string, label: string, onPress: () => void, color = GRAY) => (
        <Box key={'pill-box-' + key} borderStyle="round" borderColor={color} paddingX={1}>
          {color === GRAY ? (
            <Button key={key} plain label={label} onPress={onPress} />
          ) : (
            <Button key={key} plain label={label} onPress={onPress}>
              <Text color={color}>{label}</Text>
            </Button>
          )}
        </Box>
      )

      // One rounded card in a color: icon, title, a number on the right, then its body.
      const card = (key: string, color: string, iconKey: string, title: string, right: string, body: any) => (
        <Box key={'card-' + key} flexDirection="column">
          <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
            <Box justifyContent="space-between" alignItems="center">
              <Box alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
                <Box flexShrink={0}>{icon(iconKey, color, title + ' icon')}</Box>
                <Text bold wrap="wrap">
                  {title}
                </Text>
              </Box>
              <Box flexShrink={0} marginLeft={1}>
                <Text bold color={color}>
                  {right}
                </Text>
              </Box>
            </Box>
            {body}
          </Box>
          {gap()}
        </Box>
      )

      const refresh = pill('refresh', '↻  Refresh', go(async () => {
        await loadProjects($)
        await buildIndex($)
        $.ui.invalidate('ui.render')
        await $.ui.toast('My Projects refreshed')
      }))

      const status =
        progress.total > 0 && progress.done < progress.total ? (
          <Text dimColor>
            Reading your chats: {progress.done} of {progress.total}
          </Text>
        ) : null

      // ---- Home: every project as a colored card ----
      if (project === null) {
        return (
          <Box flexDirection="column">
            <Box justifyContent="space-between" alignItems="center">
              <Text dimColor>Click a project to open it</Text>
              {refresh}
            </Box>
            {status}
            {gap()}
            {projects.map(name => {
              const color = colorFor(name)
              const { named, worked } = chatsFor(name)
              return (
                <Box key={'proj-' + name} flexDirection="column">
                  <Box borderStyle="round" borderColor={color} paddingX={1} justifyContent="space-between" alignItems="center">
                    <Box alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
                      <Box flexShrink={0}>{icon('folder', color, name + ' folder')}</Box>
                      <Button
                        key={'p-' + name}
                        plain
                        onPress={go(async () => {
                          await update($, projectAtom, () => name)
                          await update($, folderAtom, () => '')
                          await update($, previewAtom, () => null)
                        })}
                      >
                        <Text wrap="wrap">{name}</Text>
                      </Button>
                    </Box>
                    <Box flexShrink={0} marginLeft={1}>
                      <Text bold color={color}>
                        {plural(named.length + worked.length, 'chat')}
                      </Text>
                    </Box>
                  </Box>
                  {gap()}
                </Box>
              )
            })}
          </Box>
        )
      }

      const color = colorFor(project)
      const { named, worked } = chatsFor(project)

      // ---- The top of every project screen ----
      const top = (
        <Box flexDirection="column">
          <Box justifyContent="space-between" alignItems="center">
            {pill('back', '◂  All projects', go(async () => {
              await update($, projectAtom, () => null)
              await update($, previewAtom, () => null)
            }))}
            {refresh}
          </Box>
          {gap()}
          <Box alignItems="center" gap={1}>
            <Box flexShrink={0}>{icon('folder', color, project + ' folder')}</Box>
            <Text bold color={color} wrap="wrap">
              {project}
            </Text>
          </Box>
          {gap()}
          <Box gap={1}>
            {pill('tab-chats', 'Chats  ' + (named.length + worked.length), go(async () => {
              await update($, tabAtom, () => 'chats' as Tab)
              await update($, previewAtom, () => null)
            }), tab === 'chats' ? color : GRAY)}
            {pill('tab-files', 'Files', go(async () => {
              await update($, tabAtom, () => 'files' as Tab)
              await update($, previewAtom, () => null)
            }), tab === 'files' ? color : GRAY)}
          </Box>
          {gap()}
          {status}
        </Box>
      )
      const backToList = pill('close-preview', '◂  Back to the list', go(() => update($, previewAtom, () => null)))

      // ---- One chat, opened ----
      if (preview?.kind === 'chat') {
        const c = index[preview.id]
        return (
          <Box flexDirection="column">
            {top}
            {backToList}
            {gap()}
            {c
              ? card('chat-open', color, 'chat', clip(c.title, 44), when(c.mtime), (
                  <Box flexDirection="column">
                    {gap()}
                    <Text bold color={color}>
                      Your last message
                    </Text>
                    <Text>{c.lastPrompt || 'Not found'}</Text>
                    {gap()}
                    <Text bold color={color}>
                      Claude's last reply
                    </Text>
                    <Text>{c.lastReply || 'Not found'}</Text>
                    {gap()}
                    <Box gap={1}>
                      {pill('open-chat', 'Open chat', go(() => openOnMac($, [`claude://code/continue?session=${encodeURIComponent(c.id)}`], 'the chat')), color)}
                      {pill('copy-title', 'Copy title', go(async () => {
                        const r = await $.ui.copy({ text: c.title, surface: e.surface }).catch(() => ({ isCopied: false }))
                        let isCopied = r.isCopied
                        if (!isCopied) {
                          const p = await $.process.run(['pbcopy'], { stdin: c.title }).catch(() => null)
                          isCopied = p?.exitCode === 0
                        }
                        await $.ui.toast(isCopied ? 'Title copied. Paste it in your sidebar search.' : 'Could not copy the title.')
                      }))}
                    </Box>
                  </Box>
                ))
              : <Text dimColor>That chat is gone.</Text>}
          </Box>
        )
      }

      // ---- One file, opened ----
      if (preview?.kind === 'file') {
        const full = preview.path
        const name = full.replace(/^.*\//, '')
        const kind = typeOf(name)
        const isText = /^(MD|TXT|JSON|CSV|HTML?|CSS|JS|TS|TSX|PY|SH|YML|YAML)$/.test(kind)
        const text = isText
          ? await $.fs
              .read(full, { offset: 0, length: PREVIEW_CHARS * 2 })
              .then(t => String(t))
              .catch(() => '')
          : ''
        return (
          <Box flexDirection="column">
            {top}
            {backToList}
            {gap()}
            {card('file-open', color, 'file', clip(name, 44), kind, (
              <Box flexDirection="column">
                {gap()}
                <Box gap={1}>
                  {pill('open-file', 'Open', go(() => openOnMac($, [full], name)), color)}
                  {pill('reveal-file', 'Show in Finder', go(() => openOnMac($, ['-R', full], name)))}
                </Box>
                {gap()}
                {isText ? <Text>{clip(text, PREVIEW_CHARS)}</Text> : <Text dimColor>No preview for this kind of file. Click Open.</Text>}
              </Box>
            ))}
          </Box>
        )
      }

      // ---- The project's files ----
      if (tab === 'files') {
        const base = projectPath(project)
        const here = folder ? `${base}/${folder}` : base
        const entries = await $.fs.list(here).catch(() => [])
        const visible = entries.filter(x => !x.name.startsWith('.') && x.name !== 'node_modules')
        const dirs = visible.filter(x => x.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name))
        const files = visible.filter(x => x.kind !== 'dir').sort((a, b) => b.mtimeMs - a.mtimeMs)
        const where = folder ? folder.replace(/^.*\//, '') : project
        const body = (
          <Box flexDirection="column">
            {dirs.slice(0, MAX_ROWS).map(d => (
              <Box key={'dr-' + d.name}>
                <Button
                  key={'d-' + d.name}
                  plain
                  onPress={go(() => update($, folderAtom, f => (f ? `${f}/${d.name}` : d.name)))}
                >
                  <Text color={color}>▸ </Text>
                  {d.name}
                </Button>
              </Box>
            ))}
            {files.slice(0, MAX_ROWS).map(f => {
              const kind = typeOf(f.name)
              return (
                <Box key={'fr-' + f.name} flexDirection="column">
                  <Box alignItems="center" gap={1}>
                    {kind && isDesk && Svg ? draw(chipSvg(kind), kind + ' file', 32, 13) : null}
                    <Button
                      key={'f-' + f.name}
                      plain
                      onPress={go(() => update($, previewAtom, () => ({ kind: 'file', path: `${here}/${f.name}` }) as Preview))}
                    >
                      <Text wrap="wrap">{f.name}</Text>
                    </Button>
                  </Box>
                  <Box paddingLeft={isDesk && Svg ? 5 : 0}>
                    <Text dimColor>{when(f.mtimeMs)}</Text>
                  </Box>
                </Box>
              )
            })}
            {dirs.length + files.length === 0 && <Text dimColor>This folder is empty.</Text>}
            {files.length > MAX_ROWS && <Text dimColor>{'+' + (files.length - MAX_ROWS) + ' more files'}</Text>}
          </Box>
        )
        return (
          <Box flexDirection="column">
            {top}
            {folder !== '' && (
              <Box flexDirection="column">
                {pill(
                  'up',
                  '◂  Up to ' + clip(folder.includes('/') ? folder.replace(/\/[^/]*$/, '').replace(/^.*\//, '') : project, 30),
                  go(() => update($, folderAtom, f => f.replace(/\/?[^/]*$/, ''))),
                  color,
                )}
                {gap()}
              </Box>
            )}
            {card('files', color, 'folder', clip(where, 40), plural(files.length, 'file'), body)}
          </Box>
        )
      }

      // ---- The project's chats ----
      const row = (c: Chat) => (
        <Box key={'cr-' + c.id} flexDirection="column">
          <Button key={'c-' + c.id} plain onPress={go(() => update($, previewAtom, () => ({ kind: 'chat', id: c.id }) as Preview))}>
            <Text wrap="wrap">{c.title}</Text>
          </Button>
          <Text dimColor>{when(c.mtime)}</Text>
        </Box>
      )
      const list = (rows: Chat[]) => (
        <Box flexDirection="column">
          {rows.length === 0 ? <Text dimColor>None yet</Text> : rows.slice(0, MAX_ROWS).map(row)}
          {rows.length > MAX_ROWS ? <Text dimColor>{'+' + (rows.length - MAX_ROWS) + ' more'}</Text> : null}
        </Box>
      )
      return (
        <Box flexDirection="column">
          {top}
          {card('named', color, 'chat', 'Named for this project', String(named.length), list(named))}
          {card('worked', GRAY, 'spark', 'Also worked in this folder', String(worked.length), list(worked))}
        </Box>
      )
    } catch {
      return <Text dimColor>Could not draw My Projects. Try /projects again.</Text>
    }
  })
}
