'use client';

import { createContext, useContext, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Persona } from '../lib/conversations';
import Landing from '../components/Landing';
import ChatWorkspaceLoading from '../components/chat/ChatWorkspaceLoading';

const LoadingPersonaContext = createContext<Persona>('coding');

function DynamicChatFallback() {
  const persona = useContext(LoadingPersonaContext);
  return <ChatWorkspaceLoading persona={persona} />;
}

const ChatWorkspace = dynamic(() => import('../components/chat/ChatWorkspace'), {
  loading: () => <DynamicChatFallback />,
});

export default function HomePage() {
  const [persona, setPersona] = useState<Persona | null>(null);
  return persona ? (
    <LoadingPersonaContext.Provider value={persona}>
      <ChatWorkspace key={persona} initialPersona={persona} onBack={() => setPersona(null)} />
    </LoadingPersonaContext.Provider>
  ) : (
    <Landing onSelectPersona={setPersona} />
  );
}
