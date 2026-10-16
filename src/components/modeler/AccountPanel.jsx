import { useTheme } from '@/lib/theme';

// Accounts are intentionally disconnected in this test build.
export default function AccountPanel() {
  const { uiColor } = useTheme();
  return (
    <div className="w-52 max-w-[68vw] space-y-2 p-1" style={{ color: uiColor }}>
      <p className="text-[12px] font-semibold">Local-only test</p>
      <p className="text-[11px] leading-relaxed opacity-70">No sign-in is needed. Your models are stored on this device.</p>
      <p className="text-[11px] leading-relaxed opacity-70">Accounts, cloud backups, subscriptions and payments are disabled. Pro tools remain locked.</p>
    </div>
  );
}
