import { supabase } from '../lib/supabase';
import ModalCloseButton from './ModalCloseButton';

function SettingsRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-asphalt ${
        danger ? 'text-signal-red' : 'text-ink'
      }`}
    >
      <span className="text-base w-5 text-center flex-shrink-0">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export default function SettingsModal({
  isOwner,
  isManager,
  onClose,
  onOpenManageBoards,
  onOpenAgingColors,
  onOpenRoles,
  onOpenRates,
  onOpenInvite,
  onOpenName,
  onOpenPassword,
}: {
  isOwner: boolean;
  isManager: boolean;
  onClose: () => void;
  onOpenManageBoards: () => void;
  onOpenAgingColors: () => void;
  onOpenRoles: () => void;
  onOpenRates: () => void;
  onOpenInvite: () => void;
  onOpenName: () => void;
  onOpenPassword: () => void;
}) {
  const canManage = isOwner || isManager;

  function go(action: () => void) {
    onClose();
    action();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Settings</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="py-1">
          {canManage && (
            <>
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-steel uppercase tracking-wide">
                Dealership
              </p>
              <SettingsRow icon="⚙️" label="Manage Boards" onClick={() => go(onOpenManageBoards)} />
              <SettingsRow icon="🎨" label="Aging Colors" onClick={() => go(onOpenAgingColors)} />
              <SettingsRow icon="👤" label="Roles & Team" onClick={() => go(onOpenRoles)} />
              <SettingsRow icon="💰" label="Carrying Cost Rates" onClick={() => go(onOpenRates)} />
              <SettingsRow icon="✉️" label="Invite Teammate" onClick={() => go(onOpenInvite)} />
              <SettingsRow icon="🏪" label="Dealership Name" onClick={() => go(onOpenName)} />
              <div className="border-t border-gray-100 my-1" />
            </>
          )}

          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-steel uppercase tracking-wide">
            Your Account
          </p>
          <SettingsRow icon="🔒" label="Change Password" onClick={() => go(onOpenPassword)} />
          <SettingsRow icon="🚪" label="Sign Out" danger onClick={() => supabase.auth.signOut()} />
        </div>
      </div>
    </div>
  );
}
