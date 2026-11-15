import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import {
  AlertBanner,
  Button,
  Card,
  Empty,
  Loading,
  PageHeader,
  Pill,
  Tabs,
  ConfirmDialog,
} from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface Channel {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
  nsfw: boolean;
}

interface ChannelsResponse {
  channels: Channel[];
  synced: boolean;
  lastSyncedAt?: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  kind: string;
  content?: string | null;
  embeds?: EmbedDraft[];
  channelIds?: string[];
}

interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedDraft {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
  fields?: EmbedField[];
}

type Mode = 'message' | 'embed';

export function MessageBuilderPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();

  const channelsLoad = () => api.get<ChannelsResponse>(`/api/servers/${selectedGuildId}/channels`);
  const channelsState = useGuildData(channelsLoad, [selectedGuildId]);
  const templatesLoad = () => api.get<{ rows: TemplateRow[] }>(`/api/servers/${selectedGuildId}/messages/templates`);
  const templatesState = useGuildData(templatesLoad, [selectedGuildId]);

  const [mode, setMode] = useState<Mode>('message');
  const [content, setContent] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [embeds, setEmbeds] = useState<EmbedDraft[]>([emptyEmbed()]);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [confirmMulti, setConfirmMulti] = useState(false);
  const [sending, setSending] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const channels = channelsState.data?.channels ?? [];
  const textChannels = useMemo(
    () => channels.filter((c) => c.type === 0 || c.type === 15 || c.type === 5),
    [channels],
  );

  function toggleChannel(id: string) {
    setSelectedChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function send(confirmed = false) {
    setFeedback(null);
    if (selectedChannels.length === 0) {
      setFeedback({ tone: 'danger', text: 'Select at least one channel.' });
      return;
    }
    if (!content.trim() && embeds.every((e) => !e.title && !e.description)) {
      setFeedback({ tone: 'danger', text: 'Message needs content or at least one embed.' });
      return;
    }
    if (!confirmed && selectedChannels.length > 1) {
      setConfirmMulti(true);
      return;
    }
    setSending(true);
    const payload: Record<string, unknown> = {
      channelIds: selectedChannels,
      content: content || undefined,
    };
    if (mode === 'embed') payload.embeds = embeds.map(cleanEmbed).filter((e) => e && (e.title || e.description));
    try {
      const res = await api.post<{ queued: boolean; commandId: string }>(
        `/api/servers/${selectedGuildId}/messages/send`,
        payload,
      );
      setFeedback({ tone: 'success', text: `Message queued for ${selectedChannels.length} channel(s).` });
      void res;
      setConfirmMulti(false);
    } catch (err) {
      setFeedback({ tone: 'danger', text: `Send failed: ${err instanceof Error ? err.message : 'unknown error'}` });
      setConfirmMulti(false);
    } finally {
      setSending(false);
    }
  }

  async function saveTemplate() {
    setFeedback(null);
    if (!templateName.trim()) {
      setFeedback({ tone: 'danger', text: 'Template name is required.' });
      return;
    }
    try {
      await api.post(`/api/servers/${selectedGuildId}/messages/templates`, {
        name: templateName.trim(),
        kind: mode,
        content: content || undefined,
        embeds: mode === 'embed' ? embeds.map(cleanEmbed).filter(Boolean) : undefined,
        channelIds: selectedChannels.length ? selectedChannels : undefined,
      });
      setFeedback({ tone: 'success', text: 'Template saved.' });
      setTemplateName('');
      await templatesState.reload();
    } catch (err) {
      setFeedback({ tone: 'danger', text: `Save failed: ${err instanceof Error ? err.message : 'unknown error'}` });
    }
  }

  function loadTemplate(t: TemplateRow) {
    setMode(t.kind === 'embed' ? 'embed' : 'message');
    setContent(t.content ?? '');
    if (t.embeds && t.embeds.length > 0) setEmbeds(t.embeds);
    if (t.channelIds && t.channelIds.length > 0) setSelectedChannels(t.channelIds);
    setFeedback({ tone: 'success', text: `Template "${t.name}" loaded.` });
  }

  return (
    <div>
      <PageHeader
        title="Message Builder"
        description="Compose and deliver messages and embeds to the selected server."
      />

      {feedback ? <AlertBanner tone={feedback.tone}>{feedback.text}</AlertBanner> : null}

      {channelsState.loading && !channelsState.data ? (
        <Loading />
      ) : channelsState.error ? (
        <Empty>{channelsState.error}</Empty>
      ) : !channelsState.data?.synced ? (
        <EmtpyChannels />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Editor */}
          <div className="space-y-4">
            <Card>
              <Tabs
                tabs={[
                  { id: 'message', label: 'Regular message' },
                  { id: 'embed', label: 'Embed builder' },
                ]}
                active={mode}
                onChange={(m) => setMode(m as Mode)}
              />
              {mode === 'message' ? (
                <div className="mt-4">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    maxLength={2000}
                    placeholder="Message content. Supports Discord formatting and links. @mentions allowed."
                    className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                  />
                  <div className="mt-1 text-right text-xs text-sentinel-muted">{content.length}/2000</div>
                </div>
              ) : (
                <EmbedEditor embeds={embeds} onChange={setEmbeds} />
              )}
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-sentinel-text">Channels</div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {textChannels.length === 0 ? (
                  <Empty>No text channels synced yet.</Empty>
                ) : (
                  textChannels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sentinel-surface2">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(c.id)}
                        onChange={() => toggleChannel(c.id)}
                        className="accent-indigo-500"
                      />
                      <span className="text-sentinel-text">{c.name}</span>
                      {c.nsfw ? <Pill tone="warn">NSFW</Pill> : null}
                    </label>
                  ))
                )}
              </div>
              <div className="mt-3 text-xs text-sentinel-muted">
                {selectedChannels.length} selected · last synced {channelsState.data?.lastSyncedAt ? new Date(channelsState.data.lastSyncedAt).toLocaleString() : '—'}
              </div>
            </Card>

            <Card className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
                <Button variant="secondary" onClick={() => void saveTemplate()}>
                  Save template
                </Button>
              </div>
              <Button disabled={sending} onClick={() => void send()}>
                {sending ? 'Queuing…' : 'Send message'}
              </Button>
            </Card>

            <Card>
              <div className="mb-2 text-sm font-semibold text-sentinel-text">Templates</div>
              {templatesState.data?.rows.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {templatesState.data.rows.map((t) => (
                    <Button key={t.id} variant="ghost" onClick={() => loadTemplate(t)}>
                      {t.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <Empty>No templates saved.</Empty>
              )}
            </Card>
          </div>

          {/* Preview */}
          <Card>
            <div className="mb-3 text-sm font-semibold text-sentinel-text">Live preview</div>
            <DiscordPreview content={content} embeds={mode === 'embed' ? embeds : []} />
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmMulti}
        title="Send to multiple channels?"
        message={`This message will be sent to ${selectedChannels.length} channels in ${useServerSelectedName()}. Each delivery is logged.`}
        confirmLabel="Send to all"
        onConfirm={() => void send(true)}
        onCancel={() => setConfirmMulti(false)}
      />
    </div>
  );
}

function useServerSelectedName(): string {
  return useServer().selectedServer?.name ?? 'this server';
}

function EmtpyChannels() {
  return (
    <Card>
      <Empty>
        No channels have been synced yet. The Sentinel bot syncs the channel list automatically once it is
        running in this server.
      </Empty>
    </Card>
  );
}

function emptyEmbed(): EmbedDraft {
  return { fields: [] };
}

function cleanEmbed(e: EmbedDraft): EmbedDraft | null {
  const out: EmbedDraft = {};
  if (e.title) out.title = e.title;
  if (e.description) out.description = e.description;
  if (e.url) out.url = e.url;
  if (typeof e.color === 'number' && e.color >= 0) out.color = e.color & 0xffffff;
  if (e.author?.name) out.author = { name: e.author.name, icon_url: e.author.icon_url };
  if (e.thumbnail?.url) out.thumbnail = { url: e.thumbnail.url };
  if (e.image?.url) out.image = { url: e.image.url };
  if (e.footer?.text) out.footer = { text: e.footer.text, icon_url: e.footer.icon_url };
  if (e.timestamp) out.timestamp = e.timestamp;
  if (e.fields && e.fields.length > 0) out.fields = e.fields.filter((f) => f.name || f.value);
  if (!out.title && !out.description && !out.fields?.length) return null;
  return out;
}

function EmbedEditor({ embeds, onChange }: { embeds: EmbedDraft[]; onChange: (e: EmbedDraft[]) => void }) {
  function update(i: number, patch: Partial<EmbedDraft>) {
    onChange(embeds.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  return (
    <div className="mt-4 space-y-4">
      {embeds.map((embed, i) => (
        <div key={i} className="rounded-lg border border-sentinel-border bg-sentinel-surface2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-sentinel-muted">Embed {i + 1}</div>
            {embeds.length > 1 ? (
              <Button variant="danger" onClick={() => onChange(embeds.filter((_, idx) => idx !== i))}>
                Remove
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Input label="Title" value={embed.title ?? ''} onChange={(v) => update(i, { title: v })} />
            <Input label="Description" value={embed.description ?? ''} onChange={(v) => update(i, { description: v })} textarea />
            <Input label="URL" value={embed.url ?? ''} onChange={(v) => update(i, { url: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Author name"
                value={embed.author?.name ?? ''}
                onChange={(v) => update(i, { author: { name: v, icon_url: embed.author?.icon_url } })}
              />
              <Input
                label="Author icon URL"
                value={embed.author?.icon_url ?? ''}
                onChange={(v) => update(i, { author: { name: embed.author?.name ?? '', icon_url: v } })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Thumbnail URL" value={embed.thumbnail?.url ?? ''} onChange={(v) => update(i, { thumbnail: { url: v } })} />
              <Input label="Image URL" value={embed.image?.url ?? ''} onChange={(v) => update(i, { image: { url: v } })} />
            </div>
            <div className="grid grid-cols-2 items-end gap-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Color</div>
                <input
                  type="color"
                  value={colorToHex(embed.color ?? 0x7c5cff)}
                  onChange={(ev) => update(i, { color: parseInt(ev.target.value.slice(1), 16) })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-sentinel-border bg-sentinel-bg"
                />
              </div>
              <Input label="Footer text" value={embed.footer?.text ?? ''} onChange={(v) => update(i, { footer: { text: v, icon_url: embed.footer?.icon_url } })} />
            </div>
            <Input label="Footer icon URL" value={embed.footer?.icon_url ?? ''} onChange={(v) => update(i, { footer: { text: embed.footer?.text ?? '', icon_url: v } })} />
          </div>
          <FieldsEditor
            fields={embed.fields ?? []}
            onChange={(fields) => update(i, { fields })}
          />
        </div>
      ))}
      {embeds.length < 10 ? (
        <Button variant="secondary" onClick={() => onChange([...embeds, emptyEmbed()])}>
          Add embed
        </Button>
      ) : null}
    </div>
  );
}

function FieldsEditor({ fields, onChange }: { fields: EmbedField[]; onChange: (f: EmbedField[]) => void }) {
  function update(i: number, patch: Partial<EmbedField>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Fields</div>
      <div className="space-y-1.5">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={f.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Field name"
              className="flex-1 rounded border border-sentinel-border bg-sentinel-bg px-2 py-1 text-xs focus:border-sentinel-accent2 focus:outline-none"
            />
            <input
              value={f.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="Value"
              className="flex-[2] rounded border border-sentinel-border bg-sentinel-bg px-2 py-1 text-xs focus:border-sentinel-accent2 focus:outline-none"
            />
            <label className="flex items-center gap-1 text-xs text-sentinel-muted">
              <input type="checkbox" checked={f.inline} onChange={(e) => update(i, { inline: e.target.checked })} className="accent-indigo-500" />
              inline
            </label>
            <Button variant="ghost" onClick={() => onChange(fields.filter((_, idx) => idx !== i))}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      {fields.length < 25 ? (
        <Button variant="ghost" onClick={() => onChange([...fields, { name: '', value: '', inline: false }])}>
          + Add field
        </Button>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">{label}</div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-sentinel-border bg-sentinel-bg px-2.5 py-1.5 text-sm focus:border-sentinel-accent2 focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-sentinel-border bg-sentinel-bg px-2.5 py-1.5 text-sm focus:border-sentinel-accent2 focus:outline-none"
        />
      )}
    </div>
  );
}

function colorToHex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

function DiscordPreview({ content, embeds }: { content: string; embeds: EmbedDraft[] }) {
  return (
    <div className="rounded-lg bg-[#313338] p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sentinel-accent to-sentinel-indigo text-sm font-bold text-white">
          S
        </div>
        <div>
          <div className="text-sm font-semibold text-white">
            Sentinel <span className="ml-1 rounded bg-indigo-500/30 px-1 text-[10px] font-medium text-indigo-300">APP</span>
          </div>
          <div className="text-xs text-[#949ba4]">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
      {content ? <div className="whitespace-pre-wrap text-[15px] text-[#dbdee1]">{content}</div> : null}
      {embeds.filter((e) => e.title || e.description).map((e, i) => (
        <div key={i} className="mt-2 flex overflow-hidden rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: colorToHex(e.color ?? 0x7c5cff) }}>
          <div className="min-w-0">
            {e.author?.name ? (
              <div className="mb-1 text-sm font-medium text-white">
                {e.author.icon_url ? <img src={e.author.icon_url} alt="" className="mr-1 inline h-5 w-5 rounded-full" /> : null}
                {e.author.name}
              </div>
            ) : null}
            {e.title ? <div className="text-base font-semibold text-[#65b8ff]">{e.title}</div> : null}
            {e.description ? <div className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{e.description}</div> : null}
            {e.fields && e.fields.length > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {e.fields.filter((f) => f.name || f.value).map((f, fi) => (
                  <div key={fi} className="min-w-0">
                    <div className="text-sm font-medium text-white">{f.name}</div>
                    <div className="text-sm text-[#dbdee1]">{f.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {e.image?.url ? <img src={e.image.url} alt="" className="mt-2 max-h-48 rounded object-cover" /> : null}
            {e.footer?.text ? (
              <div className="mt-2 flex items-center gap-1 text-xs text-[#949ba4]">
                {e.footer.icon_url ? <img src={e.footer.icon_url} alt="" className="h-4 w-4 rounded-full" /> : null}
                {e.footer.text}
                {e.timestamp ? <span>· {new Date(e.timestamp).toLocaleString()}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}