import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import DealerBoard from '../components/DealerBoard';
import DealershipPicker from '../components/DealershipPicker';

type Profile = { dealership_id: string | null; role: string };
type ViewingDealership = { id: string; name: string };

export default function Dashboard() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dealershipName, setDealershipName] = useState<string>('Your dealership');
  const [viewingAsOwner, setViewingAsOwner] = useState<ViewingDealership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('dealership_id, role')
      .eq('id', session.user.id)
      .single();

    if (profileError || !data) {
      setError("Couldn't load this account's profile.");
      setLoading(false);
      return;
    }

    setProfile(data);

    if (data.role !== 'owner' && data.dealership_id) {
      const { data: dealership } = await supabase
        .from('dealerships')
        .select('name')
        .eq('id', data.dealership_id)
        .single();
      setDealershipName(dealership?.name ?? 'Your dealership');
    }

    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-steel text-sm">Loading…</p>
      </div>
    );
  }

  if (error || !profile) {
    return <p className="text-signal-red text-sm p-4">{error}</p>;
  }

  const isOwner = profile.role === 'owner';
  const headerLabel = isOwner
    ? viewingAsOwner
      ? `Owner Mode — ${viewingAsOwner.name}`
      : 'Owner Mode'
    : dealershipName;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ink text-white px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-steel uppercase tracking-wide">
            {isOwner ? 'Owner' : 'Dealership'}
          </p>
          <h1 className="text-lg font-semibold">{headerLabel}</h1>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && viewingAsOwner && (
            <button onClick={() => setViewingAsOwner(null)} className="text-sm text-steel hover:text-white">
              ← Dealer list
            </button>
          )}
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-steel hover:text-white">
            Sign out
          </button>
        </div>
      </header>

      {isOwner ? (
        viewingAsOwner ? (
          <DealerBoard dealershipId={viewingAsOwner.id} />
        ) : (
          <DealershipPicker onSelect={setViewingAsOwner} />
        )
      ) : profile.dealership_id ? (
        <DealerBoard dealershipId={profile.dealership_id} />
      ) : (
        <p className="p-4 text-signal-red text-sm">
          This account isn't linked to a dealership yet.
        </p>
      )}
    </div>
  );
}
