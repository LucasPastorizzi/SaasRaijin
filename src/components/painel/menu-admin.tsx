"use client";
import { useMemo, useRef, useState } from "react";
import { Plus, Pause, Play, Pencil, Trash2, ImagePlus, Copy, Percent, GripVertical, ArrowUp, ArrowDown, History } from "lucide-react";
import { Card, PageHead, canManage, useStaff } from "./shell";
import { Badge, Button, cx, DishArt, Field, Input, Select, Sheet, Spinner, Textarea, Toggle, useToast } from "../ui";
import { api, centsToInput, inputToCents, useApi } from "@/lib/client";
import { brl, fmtDateTime, fold } from "@/lib/format";
import type { MenuCategory, MenuGroup, MenuProduct } from "@/lib/server/menu";

type AdminMenu = { categories: MenuCategory[]; products: MenuProduct[]; groups: MenuGroup[]; priceHistory: { name: string; old_cents: number | null; new_cents: number; changed_by: string; at: string }[] };
const TAGS = [["novo", "Novo"], ["mais-vendido", "Mais vendido"], ["promo", "Promo"], ["vegetariano", "Vegetariano"], ["picante", "Picante"], ["sem-gluten", "Sem glúten"]];

export function MenuAdmin() {
  const staff = useStaff();
  const manage = canManage(staff);
  const toast = useToast();
  const { data, reload } = useApi<AdminMenu>("/api/admin/menu");
  const [tab, setTab] = useState<"produtos" | "categorias" | "adicionais" | "historico">("produtos");
  const [cat, setCat] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [edit, setEdit] = useState<MenuProduct | "new" | null>(null);
  const [bulk, setBulk] = useState(false);

  const list = useMemo(() => (data?.products ?? []).filter((p) => (cat === "all" || p.category_id === cat) && (!q || fold(p.name).includes(fold(q)))), [data, cat, q]);
  if (!data) return <div className="grid h-80 place-items-center"><Spinner /></div>;

  const pause = async (p: MenuProduct) => {
    try { await api(`/api/admin/products/${p.id}`, { method: "PATCH", body: { paused: !p.paused } }); toast(p.paused ? `${p.name} voltou ao cardápio` : `${p.name} pausado`, "ok"); reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div>
      <PageHead title="cardápio" sub={`${data.products.length} produtos · ${data.products.filter((p) => p.paused).length} pausados`}>
        {manage && <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4" />Novo produto</Button>}
      </PageHead>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 sm:px-6">
        {([["produtos", "Produtos"], ["categorias", "Categorias"], ["adicionais", "Adicionais"], ["historico", "Histórico de preços"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("shrink-0 rounded-full px-4 py-2 text-sm font-semibold cursor-pointer", tab === k ? "bg-ink text-paper" : "bg-ink/6")}>{l}</button>
        ))}
      </div>

      {tab === "produtos" && (
        <div className="px-4 pb-10 pt-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select className="max-w-xs" value={cat} onChange={(e) => setCat(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">Todas as categorias</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {sel.length > 0 && manage && <Button variant="ink" onClick={() => setBulk(true)}>Ações em massa ({sel.length})</Button>}
          </div>
          <Card className="mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink/4 text-left text-xs uppercase tracking-wider text-ink/55">
                <tr>
                  <th className="w-10 p-3">{manage && <input type="checkbox" aria-label="Selecionar todos" className="accent-salmon" checked={sel.length === list.length && list.length > 0} onChange={(e) => setSel(e.target.checked ? list.map((p) => p.id) : [])} />}</th>
                  <th className="p-3">Produto</th><th className="hidden p-3 md:table-cell">Categoria</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {list.map((p) => (
                  <tr key={p.id} className={cx(!p.active && "opacity-50")}>
                    <td className="p-3">{manage && <input type="checkbox" aria-label={`Selecionar ${p.name}`} className="accent-salmon" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="size-11 shrink-0 overflow-hidden rounded-lg">{p.image ? <img src={p.image} alt="" className="size-full object-cover" /> : <DishArt seed={p.name} className="size-full" />}</div>
                        <div className="min-w-0">
                          <p className="font-semibold">{p.name}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.paused ? <Badge tone="danger">pausado</Badge> : null}
                            {!p.active && <Badge>oculto</Badge>}
                            {p.stock !== null && <Badge tone={p.stock > 0 ? "neutral" : "danger"}>estoque {p.stock}</Badge>}
                            {p.variants.length > 0 && <Badge>{p.variants.length} variações</Badge>}
                            {p.groups.length > 0 && <Badge>{p.groups.length} adicionais</Badge>}
                            {p.promo_price_cents != null && <Badge tone="salmon">promo {brl(p.promo_price_cents)}</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden p-3 text-ink/65 md:table-cell">{data.categories.find((c) => c.id === p.category_id)?.name}</td>
                    <td className="p-3 text-right font-semibold">{brl(p.price_cents)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant={p.paused ? "salmon" : "line"} onClick={() => pause(p)} title={p.paused ? "Despausar" : "Pausar (esgotou)"}>{p.paused ? <Play className="size-4" /> : <Pause className="size-4" />}<span className="hidden sm:inline">{p.paused ? "Voltar" : "Pausar"}</span></Button>
                        {manage && <Button size="sm" variant="ghost" onClick={() => setEdit(p)} aria-label="Editar"><Pencil className="size-4" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <p className="p-8 text-center text-ink/55">Nenhum produto</p>}
          </Card>
        </div>
      )}

      {tab === "categorias" && <Categories data={data} reload={reload} manage={manage} />}
      {tab === "adicionais" && <Groups data={data} reload={reload} manage={manage} />}
      {tab === "historico" && (
        <div className="px-4 pb-10 pt-4 sm:px-6">
          <Card className="divide-y divide-ink/8">
            {data.priceHistory.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="flex items-center gap-2"><History className="size-4 text-ink/40" /><b>{h.name}</b></span>
                <span>{h.old_cents != null ? <><s className="text-ink/45">{brl(h.old_cents)}</s> → </> : "criado com "}<b>{brl(h.new_cents)}</b></span>
                <span className="text-xs text-ink/55">{h.changed_by} · {fmtDateTime(h.at.includes("T") ? h.at : h.at.replace(" ", "T") + "Z")}</span>
              </div>
            ))}
            {!data.priceHistory.length && <p className="p-8 text-center text-ink/55">Sem alterações ainda</p>}
          </Card>
        </div>
      )}

      {edit && <ProductForm product={edit === "new" ? null : edit} data={data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {bulk && <BulkSheet ids={sel} onClose={() => setBulk(false)} onDone={() => { setBulk(false); setSel([]); reload(); }} />}
    </div>
  );
}

function ProductForm({ product, data, onClose, onSaved }: { product: MenuProduct | null; data: AdminMenu; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    category_id: product?.category_id ?? data.categories[0]?.id ?? 0, name: product?.name ?? "", description: product?.description ?? "",
    price: centsToInput(product?.price_cents ?? 0), promo: centsToInput(product?.promo_price_cents), promo_until: product?.promo_until?.slice(0, 16) ?? "",
    image: product?.image ?? null as string | null, tags: product?.tags ?? [], pieces: product?.pieces?.toString() ?? "", prep: product?.prep_minutes?.toString() ?? "",
    sku: product?.sku ?? "", stock: product?.stock?.toString() ?? "", active: product ? !!product.active : true, paused: product ? !!product.paused : false,
    variants: product?.variants.map((v) => ({ name: v.name, price: centsToInput(v.price_cents) })) ?? [] as { name: string; price: string }[],
    groupIds: product?.groups.map((g) => g.id) ?? [] as number[],
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  const upload = async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) return toast(j.error, "error");
    set({ image: j.url });
  };
  const save = async () => {
    setBusy(true);
    const body = {
      category_id: f.category_id, name: f.name.trim(), description: f.description.trim(), price_cents: inputToCents(f.price),
      promo_price_cents: f.promo ? inputToCents(f.promo) : null, promo_until: f.promo_until ? new Date(f.promo_until).toISOString() : null,
      image: f.image, tags: f.tags, pieces: f.pieces ? Number(f.pieces) : null, prep_minutes: f.prep ? Number(f.prep) : null, sku: f.sku || null,
      stock: f.stock === "" ? null : Number(f.stock), active: f.active, paused: f.paused,
      variants: f.variants.filter((v) => v.name).map((v) => ({ name: v.name, price_cents: inputToCents(v.price) })), groupIds: f.groupIds,
    };
    try {
      if (product) await api(`/api/admin/products/${product.id}`, { method: "PATCH", body });
      else await api("/api/admin/products", { body });
      toast("Produto salvo — já aparece no app", "ok"); onSaved();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} wide title={product ? "Editar produto" : "Novo produto"} footer={
      <div className="flex items-center justify-between gap-2">
        {product ? <Button variant="ghost" className="text-torii" onClick={async () => { if (!confirm(`Excluir ${product.name}? O histórico de pedidos é mantido.`)) return; await api(`/api/admin/products/${product.id}`, { method: "DELETE" }); onSaved(); }}><Trash2 className="size-4" />Excluir</Button> : <span />}
        <Button loading={busy} disabled={!f.name || !f.price} onClick={save}>Salvar produto</Button>
      </div>}>
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <div>
          <button onClick={() => fileRef.current?.click()} className="group relative block aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-ink/10 cursor-pointer">
            {f.image ? <img src={f.image} alt="" className="size-full object-cover" /> : <DishArt seed={f.name || "novo"} className="size-full" />}
            <span className="absolute inset-0 grid place-items-center bg-ink/50 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100"><span className="flex items-center gap-1"><ImagePlus className="size-4" />Trocar foto</span></span>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {f.image && <button className="mt-2 text-xs text-ink/55 underline cursor-pointer" onClick={() => set({ image: null })}>remover foto</button>}
          <div className="mt-4 flex flex-col gap-3">
            <Toggle checked={f.active} onChange={(v) => set({ active: v })} label="Visível no app" />
            <Toggle checked={f.paused} onChange={(v) => set({ paused: v })} label="Pausado (esgotado)" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" className="col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Descrição" className="col-span-2"><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Categoria"><Select value={f.category_id} onChange={(e) => set({ category_id: Number(e.target.value) })}>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Preço (R$)"><Input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} /></Field>
          <Field label="Preço promocional" hint="vazio = sem promoção"><Input inputMode="decimal" value={f.promo} onChange={(e) => set({ promo: e.target.value })} /></Field>
          <Field label="Promoção até" hint="vazio = sem prazo"><Input type="datetime-local" value={f.promo_until} onChange={(e) => set({ promo_until: e.target.value })} /></Field>
          <Field label="Nº de peças"><Input inputMode="numeric" value={f.pieces} onChange={(e) => set({ pieces: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Tempo de preparo (min)"><Input inputMode="numeric" value={f.prep} onChange={(e) => set({ prep: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Estoque do dia" hint="vazio = sem controle; zera → esgota sozinho"><Input inputMode="numeric" value={f.stock} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Código interno (SKU)"><Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-[13px] font-semibold text-ink/80">Selos</p>
            <div className="flex flex-wrap gap-1.5">{TAGS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => set({ tags: f.tags.includes(k) ? f.tags.filter((t) => t !== k) : [...f.tags, k] })} className={cx("rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer", f.tags.includes(k) ? "bg-salmon text-white" : "bg-ink/6")}>{l}</button>
            ))}</div>
          </div>

          <div className="col-span-2 rounded-2xl bg-ink/[.04] p-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Variações (tamanhos/quantidades)</p>
              <Button size="sm" variant="ghost" onClick={() => set({ variants: [...f.variants, { name: "", price: "" }] })}><Plus className="size-4" />Adicionar</Button></div>
            <p className="text-xs text-ink/55">Ex.: Hot 10 un / 20 un. Com variações, o cliente escolhe uma e o preço vem dela.</p>
            {f.variants.map((v, i) => (
              <div key={i} className="mt-2 flex gap-2">
                <Input placeholder="Nome (ex.: 20 unidades)" value={v.name} onChange={(e) => set({ variants: f.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input className="w-28" inputMode="decimal" placeholder="R$" value={v.price} onChange={(e) => set({ variants: f.variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                <Button size="sm" variant="ghost" aria-label="Remover" onClick={() => set({ variants: f.variants.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>

          <div className="col-span-2 rounded-2xl bg-ink/[.04] p-3">
            <p className="text-sm font-semibold">Grupos de adicionais</p>
            <p className="text-xs text-ink/55">Crie e edite grupos na aba “Adicionais”. Aqui tu escolhe quais aparecem neste produto, na ordem marcada.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{data.groups.map((g) => {
              const on = f.groupIds.includes(g.id);
              return <button key={g.id} type="button" onClick={() => set({ groupIds: on ? f.groupIds.filter((x) => x !== g.id) : [...f.groupIds, g.id] })}
                className={cx("rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer", on ? "bg-ink text-paper" : "bg-white ring-1 ring-ink/10")}>{on && `${f.groupIds.indexOf(g.id) + 1}. `}{g.name}</button>;
            })}</div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function BulkSheet({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"pct" | "add">("pct");
  const [value, setValue] = useState("");
  const run = async (action: string, v?: number) => {
    try { await api("/api/admin/products/bulk", { body: { productIds: ids, action, value: v } }); toast("Pronto!", "ok"); onDone(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Sheet open onClose={onClose} title={`${ids.length} produtos selecionados`}>
      <Card className="p-4">
        <p className="flex items-center gap-2 font-semibold"><Percent className="size-4" />Reajustar preço</p>
        <div className="mt-3 flex gap-2">
          <Select className="w-40" value={mode} onChange={(e) => setMode(e.target.value as "pct" | "add")}><option value="pct">Percentual (%)</option><option value="add">Valor (R$)</option></Select>
          <Input inputMode="decimal" placeholder={mode === "pct" ? "ex.: 8 ou -5" : "ex.: 2,00"} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <p className="mt-2 text-xs text-ink/55">Vale também para as variações. Fica registrado no histórico de preços.</p>
        <Button className="mt-3" disabled={!value} onClick={() => run(mode, mode === "pct" ? Number(value.replace(",", ".")) : inputToCents(value))}>Aplicar reajuste</Button>
      </Card>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="line" onClick={() => run("pause")}><Pause className="size-4" />Pausar todos</Button>
        <Button variant="line" onClick={() => run("unpause")}><Play className="size-4" />Despausar todos</Button>
        <Button variant="line" onClick={() => run("duplicate")}><Copy className="size-4" />Duplicar</Button>
      </div>
    </Sheet>
  );
}

function Categories({ data, reload, manage }: { data: AdminMenu; reload: () => void; manage: boolean }) {
  const toast = useToast();
  const [name, setName] = useState(""), [emoji, setEmoji] = useState("");
  const move = async (i: number, d: -1 | 1) => {
    const ids = data.categories.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await api("/api/admin/categories", { method: "PATCH", body: { order: ids } }); reload();
  };
  return (
    <div className="px-4 pb-10 pt-4 sm:px-6">
      {manage && (
        <form className="flex max-w-xl gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/admin/categories", { body: { name, emoji: emoji || undefined } }); setName(""); setEmoji(""); reload(); } catch (er) { toast((er as Error).message, "error"); } }}>
          <Input className="w-20" placeholder="🍣" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
          <Input placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name}><Plus className="size-4" />Criar</Button>
        </form>
      )}
      <Card className="mt-4 max-w-2xl divide-y divide-ink/8">
        {data.categories.map((c, i) => (
          <div key={c.id} className={cx("flex items-center gap-3 p-3", !c.active && "opacity-50")}>
            <GripVertical className="size-4 text-ink/30" />
            <span className="w-6 text-center">{c.emoji}</span>
            <input defaultValue={c.name} disabled={!manage} className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 font-semibold outline-none focus:bg-white"
              onBlur={async (e) => { if (e.target.value !== c.name) { await api(`/api/admin/categories/${c.id}`, { method: "PATCH", body: { name: e.target.value } }); reload(); } }} />
            <span className="text-xs text-ink/50">{data.products.filter((p) => p.category_id === c.id).length} itens</span>
            {manage && <>
              <Toggle checked={!!c.active} onChange={async (v) => { await api(`/api/admin/categories/${c.id}`, { method: "PATCH", body: { active: v } }); reload(); }} />
              <button aria-label="Subir" disabled={i === 0} className="cursor-pointer disabled:opacity-25" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button>
              <button aria-label="Descer" disabled={i === data.categories.length - 1} className="cursor-pointer disabled:opacity-25" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button>
              <button aria-label="Excluir" className="cursor-pointer text-ink/40 hover:text-torii" onClick={async () => { try { await api(`/api/admin/categories/${c.id}`, { method: "DELETE" }); reload(); } catch (e) { toast((e as Error).message, "error"); } }}><Trash2 className="size-4" /></button>
            </>}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Groups({ data, reload, manage }: { data: AdminMenu; reload: () => void; manage: boolean }) {
  const [edit, setEdit] = useState<MenuGroup | "new" | null>(null);
  return (
    <div className="px-4 pb-10 pt-4 sm:px-6">
      {manage && <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4" />Novo grupo de adicionais</Button>}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.groups.map((g) => (
          <Card key={g.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-semibold">{g.name}</p><p className="text-xs text-ink/55">escolher {g.min ? `de ${g.min} ` : ""}até {g.max} · usado em {data.products.filter((p) => p.groups.some((x) => x.id === g.id)).length} produtos</p></div>
              {manage && <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(g)}><Pencil className="size-4" /></Button>}
            </div>
            <ul className="mt-2 space-y-0.5 text-sm">{g.options.map((o) => <li key={o.id} className={cx("flex justify-between", o.paused && "text-ink/40 line-through")}><span>{o.name}</span><span>{o.price_cents ? `+ ${brl(o.price_cents)}` : "grátis"}</span></li>)}</ul>
          </Card>
        ))}
      </div>
      {edit && <GroupForm group={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function GroupForm({ group, onClose, onSaved }: { group: MenuGroup | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? "");
  const [min, setMin] = useState(group?.min ?? 0), [max, setMax] = useState(group?.max ?? 1);
  const [opts, setOpts] = useState(group?.options.map((o) => ({ id: o.id as number | undefined, name: o.name, price: centsToInput(o.price_cents), paused: !!o.paused })) ?? [{ id: undefined, name: "", price: "0,00", paused: false }]);
  const save = async () => {
    const body = { name, min, max, options: opts.filter((o) => o.name).map((o) => ({ id: o.id, name: o.name, price_cents: inputToCents(o.price), paused: o.paused })) };
    try { if (group) await api(`/api/admin/option-groups/${group.id}`, { method: "PUT", body }); else await api("/api/admin/option-groups", { body }); onSaved(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Sheet open onClose={onClose} title={group ? "Editar adicionais" : "Novo grupo de adicionais"} footer={
      <div className="flex justify-between">{group ? <Button variant="ghost" className="text-torii" onClick={async () => { if (confirm("Excluir grupo?")) { await api(`/api/admin/option-groups/${group.id}`, { method: "DELETE" }); onSaved(); } }}>Excluir</Button> : <span />}<Button onClick={save} disabled={!name}>Salvar</Button></div>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome do grupo" className="col-span-2" hint="Ex.: Molhos extras, Escolha a proteína"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mínimo de escolhas" hint="0 = opcional"><Input type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} /></Field>
        <Field label="Máximo de escolhas"><Input type="number" min={1} value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
      </div>
      <p className="mt-4 text-sm font-semibold">Opções</p>
      {opts.map((o, i) => (
        <div key={i} className="mt-2 flex items-center gap-2">
          <Input placeholder="Opção" value={o.name} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input className="w-24" inputMode="decimal" value={o.price} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label="Preço" />
          <button title={o.paused ? "Voltar" : "Pausar"} className="cursor-pointer" onClick={() => setOpts(opts.map((x, j) => (j === i ? { ...x, paused: !x.paused } : x)))}>{o.paused ? <Play className="size-4 text-salmon" /> : <Pause className="size-4 text-ink/40" />}</button>
          <button aria-label="Remover" className="cursor-pointer text-ink/40 hover:text-torii" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpts([...opts, { id: undefined, name: "", price: "0,00", paused: false }])}><Plus className="size-4" />Adicionar opção</Button>
    </Sheet>
  );
}
