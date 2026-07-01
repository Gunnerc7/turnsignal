import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Notification } from '../lib/types';

function formatWhen(dateStr: string): string {
  const date = new Date(dateStr);
  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return isToday ? `Today, ${time}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// Notifications follow the person, not whichever dealership they happen to
// be looking at right now — so this component is fully self-contained and
// doesn't need to know which board is currently open.
export default function NotificationBell() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadNotifications() {
    if (!session) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadNotifications();
  }, [session]);

  // Real-time: new notifications arrive instantly in the bell without
  // needing a manual refresh or page reload.
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`notifications-realtime-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${session.user.id}` },
        () => { loadNotifications(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session]);

  function handleOpen() {
    const nowOpen = !open;
    setOpen(nowOpen);
    if (nowOpen) loadNotifications();
  }

  async function markRead(n: Notification) {
    if (n.read) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative text-mist hover:text-white py-2 px-1 text-lg leading-none"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-signal-red text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lift border border-gray-200 w-72 max-h-96 overflow-y-auto z-50">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-steel uppercase tracking-wide">Notifications</p>
            </div>
            {loading ? (
              <p className="text-steel text-sm p-3">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="text-steel text-sm p-3">Nothing yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-0 ${
                    n.read ? '' : 'bg-blue-50'
                  }`}
                >
                  <p className="text-sm text-ink">{n.message}</p>
                  <p className="text-[11px] text-steel mt-0.5 tabular">{formatWhen(n.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
