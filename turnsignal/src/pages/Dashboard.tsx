import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import DealerBoard from '../components/DealerBoard';
import DealershipPicker from '../components/DealershipPicker';
import GroupStorePicker from '../components/GroupStorePicker';
import AnalyticsPage from '../components/AnalyticsPage';
import InviteTeammateModal from '../components/InviteTeammateModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import EditNameModal from '../components/EditNameModal';

type Profile = { dealership_id: string | null; role: string; dealership_role: string | null };
type ViewingDealership = { id: string; name: string; group_id?: string | null };

export default function Dashboard() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dealershipName, setDealershipName] = useState<string>('Your dealership');
  const [dealershipActive, setDealershipActive] = useState(true);
  const [dealershipGroupId, setDealershipGroupId] = useState<string | null>(null);
  const [viewingAsOwner, setViewingAsOwner] = useState<ViewingDealership | null>(null);
  const [viewingAsManager, setViewingAsManager] = useState<ViewingDealership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

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
        .select('name, active, group_id')
        .eq('id', data.dealership_id)
        .single();
      setDealershipName(dealership?.name ?? 'Your dealership');
      setDealershipActive(dealership?.active ?? true);
      setDealershipGroupId(dealership?.group_id ?? null);
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

  // The group this is relevant to, regardless of whether you're an Owner
  // peeking at a dealership or a Manager on your own store — Owner's login
  // always gets at least whatever a Manager would see here, plus more.
  const relevantGroupId = isOwner ? viewingAsOwner?.group_id ?? null : dealershipGroupId;
  const showStoreSwitcher = Boolean(relevantGroupId) && (isOwner ? Boolean(viewingAsOwner) : isManager);

  // The dealership currently being viewed, regardless of role — used for invites.
  const currentDealershipId = isOwner ? viewingAsOwner?.id : effectiveDealershipId;
  const currentDealershipName = isOwner ? viewingAsOwner?.name ?? null : effectiveDealershipName;
  const canViewAnalytics = (isOwner || isManager) && Boolean(currentDealershipId);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ink text-white px-4 py-3.5 flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-signal-amber shadow-glowAmber" aria-hidden="true" />
          <div>
            <p className="text-[11px] text-mist uppercase tracking-wider leading-none">
              {isOwner ? 'Owner' : 'Dealership'}
            </p>
            <h1 className="font-display text-lg font-semibold leading-tight">{headerLabel}</h1>
          </div>
          {canViewAnalytics && (
            <button
              onClick={() => setAnalyticsOpen(true)}
              className="ml-2 text-xs font-semibold bg-signal-blue text-white rounded-full px-3 py-1.5 whitespace-nowrap"
            >
              📊 Analytics
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showStoreSwitcher && (
            <button onClick={() => setStorePickerOpen(true)} className="text-sm text-mist hover:text-white py-2 whitespace-nowrap">
              🏢 Switch store
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
              className="text-mist hover:text-white py-2 px-1 text-lg leading-none"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <button
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lift border border-gray-200 py-1 w-44 z-50">
                  {currentDealershipId && (
                    <button
                      onClick={() => {
                        setInviteOpen(true);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left text-sm text-ink px-3 py-2.5 hover:bg-asphalt"
                    >
                      Invite
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setNameOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left text-sm text-ink px-3 py-2.5 hover:bg-asphalt"
                  >
                    Name
                  </button>
                  <button
                    onClick={() => {
                      setPasswordOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left text-sm text-ink px-3 py-2.5 hover:bg-asphalt"
                  >
                    Password
                  </button>
                  {viewingSiblingStore && (
                    <button
                      onClick={() => {
                        setViewingAsManager(null);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left text-sm text-ink px-3 py-2.5 hover:bg-asphalt"
                    >
                      ← My store
                    </button>
                  )}
                  {isOwner && viewingAsOwner && (
                    <button
                      onClick={() => {
                        setViewingAsOwner(null);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left text-sm text-ink px-3 py-2.5 hover:bg-asphalt"
                    >
                      ← Dealer list
                    </button>
                  )}
                  <button
                    onClick={() => supabase.auth.signOut()}
                    className="w-full text-left text-sm text-signal-red px-3 py-2.5 hover:bg-asphalt"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {isOwner ? (
        viewingAsOwner ? (
          <DealerBoard dealershipId={viewingAsOwner.id} isOwner isManager={isManager} refreshKey={boardRefreshKey} />
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
        <DealerBoard
          dealershipId={effectiveDealershipId}
          isOwner={false}
          isManager={effectiveIsManager}
          refreshKey={boardRefreshKey}
        />
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

      {storePickerOpen && relevantGroupId && (
        <GroupStorePicker
          groupId={relevantGroupId}
          onSelect={(store) => {
            if (isOwner) {
              setViewingAsOwner({ ...store, group_id: relevantGroupId });
            } else {
              setViewingAsManager(store);
            }
            setStorePickerOpen(false);
          }}
          onClose={() => setStorePickerOpen(false)}
        />
      )}

      {analyticsOpen && currentDealershipId && (
        <AnalyticsPage
          dealershipId={currentDealershipId}
          dealershipName={currentDealershipName ?? 'Dealership'}
          onClose={() => {
            setAnalyticsOpen(false);
            setBoardRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
