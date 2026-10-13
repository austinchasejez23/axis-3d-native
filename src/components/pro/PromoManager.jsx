import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const TYPES = [
  ['one_time', 'One time'],
  ['limited_time', 'Limited time'],
  ['limited_uses', 'Limited uses'],
];
const BENEFITS = [['month', 'Month'], ['year', 'Year'], ['lifetime', 'Lifetime']];

const fmt = (seconds) => seconds ? new Date(seconds * 1000).toLocaleString() : '—';

export default function PromoManager() {
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState(25);
  const [promoType, setPromoType] = useState('one_time');
  const [benefit, setBenefit] = useState('month');
  const [maxRedemptions, setMaxRedemptions] = useState(10);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [promos, setPromos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [disablingId, setDisablingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await base44.functions.invoke('listProPromotions', {});
      setPromos(response.data.promos || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not load promos');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const disable = async (promo) => {
    if (!window.confirm(`Disable promo ${promo.code}? It will stop working immediately.`)) return;
    setDisablingId(promo.id);
    try {
      await base44.functions.invoke('disableProPromotion', { promotionId: promo.id });
      toast.success(`Promo ${promo.code} disabled`);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || 'Could not disable promo');
    } finally { setDisablingId(null); }
  };

  const create = async () => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke('createProPromotion', {
        code, percentOff: percent, promoType, benefit,
        maxRedemptions: promoType === 'limited_uses' ? maxRedemptions : undefined,
        startAt: promoType === 'limited_time' ? startAt : undefined,
        endAt: promoType === 'limited_time' ? endAt : undefined,
      });
      toast.success(`Promo ${response.data.code} created`);
      setCode('');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || 'Could not create promo');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-1.5 border-t border-white/10 pt-2 text-white">
      <p className="mb-1 text-[11px] font-semibold text-white/70">Promos</p>

      <div className="grid grid-cols-3 gap-1">
        {TYPES.map(([id, label]) => <button key={id} onClick={() => setPromoType(id)}
          className={`h-7 rounded-md text-[10px] font-semibold ${promoType === id ? 'bg-amber-400 text-black' : 'bg-white/10 text-white'}`}>{label}</button>)}
      </div>

      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
        placeholder="PROMO CODE" maxLength={32}
        className="mt-1.5 h-8 w-full rounded-md bg-white/10 px-2 text-[12px] text-white outline-none placeholder:text-white/35" />

      <div className="mt-1.5 grid grid-cols-[1fr_4.5rem] items-center gap-2">
        <label className="text-[11px] text-white/65">Discount</label>
        <div className="flex h-7 items-center rounded-md bg-white/10 px-2">
          <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className="w-full bg-transparent text-right text-[12px] text-white outline-none" /><span className="ml-1 text-[11px] text-white/55">%</span>
        </div>
      </div>

      <p className="mt-1.5 mb-1 text-[10px] text-white/50">Subscription duration</p>
      <div className="grid grid-cols-3 gap-1">
        {BENEFITS.map(([id, label]) => <button key={id} onClick={() => setBenefit(id)}
          className={`h-7 rounded-md text-[10px] ${benefit === id ? 'bg-amber-400 text-black' : 'bg-white/10 text-white'}`}>{label}</button>)}
      </div>

      {promoType === 'limited_time' && (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <label className="text-[10px] text-white/55">Starts
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 h-8 w-full rounded-md bg-white/10 px-2 text-[11px] text-white outline-none" />
          </label>
          <label className="text-[10px] text-white/55">Ends
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
              className="mt-1 h-8 w-full rounded-md bg-white/10 px-2 text-[11px] text-white outline-none" />
          </label>
        </div>
      )}

      {promoType === 'limited_uses' && (
        <label className="mt-1.5 block text-[10px] text-white/55">Maximum uses
          <input type="number" min="1" value={maxRedemptions} onChange={(e) => setMaxRedemptions(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="mt-1 h-8 w-full rounded-md bg-white/10 px-2 text-[12px] text-white outline-none" />
        </label>
      )}

      <button disabled={busy || code.length < 3 || (promoType === 'limited_time' && (!startAt || !endAt))}
        onClick={create} className="mt-1.5 h-8 w-full rounded-md bg-white/10 text-[11px] font-semibold text-white disabled:opacity-40">
        {busy ? 'Creating…' : 'Create promo'}
      </button>

      <div className="mt-2 border-t border-white/10 pt-1.5">
        <div className="mb-1 flex items-center justify-between"><span className="text-[10px] font-semibold text-white/60">Active promos</span><button onClick={load} className="text-[10px] text-amber-300">Refresh</button></div>
        {promos.length === 0 ? <p className="text-[10px] text-white/35">No active promos.</p> :
          <div className="space-y-1">{promos.map((promo) => (
            <div key={promo.id} className="rounded-md bg-white/5 px-2 py-1 text-[10px] leading-snug">
              <div className="flex justify-between gap-2"><strong className="text-white">{promo.code}</strong><span className="text-amber-300">{promo.percentOff || '?'}% off · {promo.benefit}</span></div>
              <div className="text-white/55">
                {promo.promoType === 'one_time' && `One time · ${promo.timesRedeemed}/1 used`}
                {promo.promoType === 'limited_uses' && `Limited uses · ${promo.timesRedeemed}/${promo.maxRedemptions} used`}
                {promo.promoType === 'limited_time' && `Limited time · ${fmt(promo.startAt)} → ${fmt(promo.endAt)}`}
                {promo.promoType === 'legacy' && `Legacy promo · ${promo.timesRedeemed}${promo.maxRedemptions ? `/${promo.maxRedemptions}` : ''} used`}
              </div>
              <button type="button" disabled={disablingId === promo.id} onClick={() => disable(promo)}
                className="mt-1.5 h-7 w-full rounded-md border border-red-400/30 bg-red-400/10 text-[10px] font-semibold text-red-300 disabled:opacity-40">
                {disablingId === promo.id ? 'Disabling…' : 'Disable promo'}
              </button>
            </div>
          ))}</div>}
      </div>
    </div>
  );
}