import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppShell, AppMenuItem } from 'components/AppShell';
import { HomeScreen } from 'components/HomeScreen';
import { DrawingScreen } from 'components/DrawingScreen';
import { databaseService } from 'services/DatabaseService';
import { log } from 'services/Logger';
import { palette } from 'components/theme';

import './tailwind.css';

type Screen = 'home' | 'drawing';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [homeKey, setHomeKey] = useState(0);

  const getTodayString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    // Initialize database when app starts
    log.info('App starting, initializing database');
    databaseService.initDatabase().catch((error) => {
      log.error('Failed to initialize database:', error);
    });
  }, []);

  const handleDateSelect = (date: string) => {
    log.info('Navigating to drawing screen', { date });
    setSelectedDate(date);
    setCurrentScreen('drawing');
  };

  const handleBackToHome = () => {
    log.info('Navigating back to home screen');
    setCurrentScreen('home');
    setSelectedDate('');
    // Force home screen to refresh by changing key
    setHomeKey((prev) => prev + 1);
  };

  const handleTodaySelect = () => {
    const todayString = getTodayString();
    log.info('Navigating to today from menu', { date: todayString });
    setSelectedDate(todayString);
    setCurrentScreen('drawing');
  };

  const menuItems: AppMenuItem[] = [
    {
      label: 'Home',
      description: 'Calendar and saved days',
      icon: 'calendar-outline',
      onPress: handleBackToHome,
    },
    {
      label: "Today's Note",
      description: 'Open a fresh page for today',
      icon: 'create-outline',
      onPress: handleTodaySelect,
    },
  ];

  return (
    <AppShell menuItems={menuItems}>
      {(openMenu) => (
        <>
          {currentScreen === 'home' ? (
            <HomeScreen key={homeKey} onDateSelect={handleDateSelect} onOpenMenu={openMenu} />
          ) : (
            <DrawingScreen date={selectedDate} onBack={handleBackToHome} />
          )}
          <StatusBar style="dark" backgroundColor={palette.background} />
        </>
      )}
    </AppShell>
  );
}
