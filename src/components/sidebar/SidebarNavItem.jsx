const SidebarNavItem = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-white/15 text-white'
        : 'text-white/60 hover:bg-white/10 hover:text-white/90'
    }`}
  >
    <span className="w-4 flex-shrink-0 flex items-center justify-center">{icon}</span>
    <span className="truncate">{label}</span>
  </button>
);

export default SidebarNavItem;
