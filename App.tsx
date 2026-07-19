import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppShell } from 'components/AppShell';
import { HomeScreen } from 'components/HomeScreen';
import { DrawingScreen } from 'components/DrawingScreen';
import { DebugLogsScreen } from 'components/DebugLogsScreen';
import { ThemeProvider } from 'components/theme';
import { databaseService } from 'services/DatabaseService';
import { JournalTypeId } from 'services/JournalTypes';
import { installCrashLogger, log } from 'services/Logger';
import 'services/LocalVectorizationBundle';

import './tailwind.css';

installCrashLogger();

type Screen = 'home' | 'drawing' | 'debug-logs';

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

  const menuItems = __DEV__
    ? [
        {
          description: 'View the current app log file',
          icon: 'bug-outline' as const,
          label: 'Debug logs',
          onPress: () => setCurrentScreen('debug-logs' as const),
        },
      ]
    : [];

  return (
    <ThemeProvider>
      <AppShell menuItems={menuItems}>
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
            ) : currentScreen === 'debug-logs' ? (
              <DebugLogsScreen onBack={handleBackToHome} />
            ) : null}
            <StatusBar style="dark" />
          </>
        )}
      </AppShell>
    </ThemeProvider>
  );
}
