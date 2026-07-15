import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppShell } from 'components/AppShell';
import { HomeScreen } from 'components/HomeScreen';
import { DrawingScreen } from 'components/DrawingScreen';
import { databaseService } from 'services/DatabaseService';
import { JournalTypeId } from 'services/JournalTypes';
import { log } from 'services/Logger';
import 'services/LocalVectorizationBundle';

import './tailwind.css';

type Screen = 'home' | 'drawing';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedJournal, setSelectedJournal] = useState<{
    date: string;
    journalType: JournalTypeId;
    initialImage?: { base64: string; mimeType?: string | null };
  } | null>(null);
  const [homeKey, setHomeKey] = useState(0);

  useEffect(() => {
    log.info('App starting, initializing database');
    databaseService
      .initDatabase()
      .catch((error) => log.error('Failed to initialize database:', error));
  }, []);

  const handleJournalSelect = (date: string, journalType: JournalTypeId) => {
    log.info('Navigating to journal entry', { date, journalType });
    setSelectedJournal({ date, journalType });
    setCurrentScreen('drawing');
  };

  const handleImportFromPicture = (
    date: string,
    journalType: JournalTypeId,
    image: { base64: string; mimeType?: string | null }
  ) => {
    log.info('Navigating to journal entry with imported image', { date, journalType });
    setSelectedJournal({ date, journalType, initialImage: image });
    setCurrentScreen('drawing');
  };

  const handleBackToHome = () => {
    setCurrentScreen('home');
    setSelectedJournal(null);
    setHomeKey((previous) => previous + 1);
  };

  return (
    <AppShell menuItems={[]}>
      {() => (
        <>
          {currentScreen === 'home' ? (
            <HomeScreen
              key={homeKey}
              onJournalSelect={handleJournalSelect}
              onImportFromPicture={handleImportFromPicture}
            />
          ) : selectedJournal ? (
            <DrawingScreen
              date={selectedJournal.date}
              journalType={selectedJournal.journalType}
              initialImage={selectedJournal.initialImage}
              onBack={handleBackToHome}
            />
          ) : null}
          <StatusBar style="dark" />
        </>
      )}
    </AppShell>
  );
}
