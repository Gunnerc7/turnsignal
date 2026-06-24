import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import DealerBoard from '../components/DealerBoard';
import DealershipPicker from '../components/DealershipPicker';
import GroupStorePicker from '../components/GroupStorePicker';
import InviteTeammateModal from '../components/InviteTeammateModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import EditNameModal from '../components/EditNameModal';

type Profile = { dealership_id: string | null; role: string; dealership_role: string | null };
type ViewingDealership = { id: string; name: string };

export default function Dashboard() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dealershipName, setDealershipName] = useState<string>('Your dealership');
  const [dealershipActive, setDealershipActive] = useState(true);
  const [viewingAsOwner, setViewingAsOwner] = useState<ViewingDealership | null>(null);
  const [viewingAsManager, setViewingAsManager] = useState<ViewingDealership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('dealership_id, role, dealership_role')
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
        .select('name, active')
        .eq('id', data.dealership_id)
        .single();
      setDealershipName(dealership?.name ?? 'Your dealership');
      setDealershipActive(dealership?.active ?? true);
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
  const isManager = profile.dealership_role === 'manager';
  const canAssignRoles = isOwner || isManager;

  // A Manager only keeps Manager privileges (Roles button, etc.) on their
  // own home store — viewing a sibling store in the group is full access,
  // but not "I manage this one" access.
  const viewingSiblingStore = isManager && viewingAsManager && viewingAsManager.id !== profile.dealership_id;
  const effectiveIsManager = isManager && !viewingSiblingStore;
  const effectiveDealershipId = viewingAsManager ? viewingAsManager.id : profile.dealership_id;
  const effectiveDealershipName = viewingAsManager ? viewingAsManager.name : dealershipName;

  const headerLabel = isOwner
    ? viewingAsOwner
      ? `Owner Mode — ${viewingAsOwner.name}`
      : 'Owner Mode'
    : effectiveDealershipName;

  // The dealership currently being viewed, regardless of role — used for invites.
  const currentDealershipId = isOwner ? viewingAsOwner?.id : effectiveDealershipId;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ink text-white px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-signal-amber shadow-glowAmber" aria-hidden="true" />
          <div>
            <p className="text-[11px] text-steel uppercase tracking-wider leading-none">
              {isOwner ? 'Owner' : 'Dealership'}
            </p>
            <h1 className="font-display text-lg font-semibold leading-tight">{headerLabel}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentDealershipId && (
            <button onClick={() => setInviteOpen(true)} className="text-sm text-steel hover:text-white py-2">
              Invite
            </button>
          )}
          <button onClick={() => setNameOpen(true)} className="text-sm text-steel hover:text-white py-2">
            Name
          </button>
          <button onClick={() => setPasswordOpen(true)} className="text-sm text-steel hover:text-white py-2">
            Password
          </button>
          {isManager && (
            <button onClick={() => setStorePickerOpen(true)} className="text-sm text-steel hover:text-white py-2">
              🏢 Switch store
            </button>
          )}
          {viewingSiblingStore && (
            <button onClick={() => setViewingAsManager(null)} className="text-sm text-steel hover:text-white py-2">
              ← My store
            </button>
          )}
          {isOwner && viewingAsOwner && (
            <button onClick={() => setViewingAsOwner(null)} className="text-sm text-steel hover:text-white py-2">
              ← Dealer list
            </button>
          )}
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-steel hover:text-white py-2">
            Sign out
          </button>
        </div>
      </header>

      {isOwner ? (
        viewingAsOwner ? (
          <DealerBoard dealershipId={viewingAsOwner.id} isOwner isManager={isManager} />
        ) : (
          <DealershipPicker onSelect={setViewingAsOwner} />
        )
      ) : !dealershipActive ? (
        <div className="p-6 max-w-sm mx-auto text-center mt-12">
          <p className="font-display text-lg font-semibold text-ink mb-2">Access paused</p>
          <p className="text-steel text-sm">
            This dealership's access has been paused. Contact your TurnSignal administrator for details.
          </p>
        </div>
      ) : effectiveDealershipId ? (
        <DealerBoard dealershipId={effectiveDealershipId} isOwner={false} isManager={effectiveIsManager} />
      ) : (
        <p className="p-4 text-signal-red text-sm">
          This account isn't linked to a dealership yet.
        </p>
      )}

      {inviteOpen && currentDealershipId && (
        <InviteTeammateModal
          dealershipId={currentDealershipId}
          canAssignRoles={canAssignRoles}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}

      {nameOpen && <EditNameModal onClose={() => setNameOpen(false)} />}

      {storePickerOpen && (
        <GroupStorePicker
          onSelect={(store) => {
            setViewingAsManager(store);
            setStorePickerOpen(false);
          }}
          onClose={() => setStorePickerOpen(false)}
        />
      )}
    </div>
  );
}
