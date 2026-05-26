// src/components/Header.jsx
import NavBar from "./NavBar";
import NavigationSidebar from "./NavigationSidebar";
import { useConversations } from "../hooks/useConversations";
import "../styles/NavBar.css";

export default function Header({
  user,
  handleLogout,
  capBlock,
  cardanoBlock,
  syncStatus,
  syncPct,
  syncLag,
  healthOnline,
  sidebarIsOpen,
  setSidebarOpen,
  authFetch,
  billingAccess,
  billingAccessLoading,
  refreshBillingAccess,
}) {
  const showSidebar = !!user && !!setSidebarOpen;

  const { conversations, isLoading, renameConversation, deleteConversation } =
    useConversations(authFetch, showSidebar);

  return (
    <>
      {showSidebar && (
        <NavigationSidebar
          isOpen={sidebarIsOpen}
          setIsOpen={setSidebarOpen}
          handleLogout={handleLogout}
          user={user}
          conversations={conversations}
          conversationsLoading={isLoading}
          onRenameConversation={renameConversation}
          onDeleteConversation={deleteConversation}
        />
      )}

      <div className={showSidebar ? "has-left-burger" : ""}>
        <NavBar
          userData={user}
          handleLogout={handleLogout}
          capBlock={capBlock}
          cardanoBlock={cardanoBlock}
          syncStatus={syncStatus}
          syncLag={syncLag}
          syncPct={syncPct}
          healthOnline={healthOnline}
          billingAccess={billingAccess}
          billingAccessLoading={billingAccessLoading}
          refreshBillingAccess={refreshBillingAccess}
        />
      </div>
    </>
  );
}
