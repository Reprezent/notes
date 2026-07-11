import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { databaseService, JournalEntry } from '../services/DatabaseService';
import { JOURNAL_TYPES, JournalType, JournalTypeId } from '../services/JournalTypes';
import { palette } from './theme';

interface HomeScreenProps {
  onJournalSelect: (date: string, journalType: JournalTypeId) => void;
}

type HomeTab = 'home' | 'calendar' | 'notifications';

const tabs: {
  key: HomeTab | 'create';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  { key: 'create', label: 'Create', icon: 'add-circle-outline' },
];

const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const HomeScreen: React.FC<HomeScreenProps> = ({ onJournalSelect }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>('home');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [menuAnimation] = useState(() => new Animated.Value(0));
  const todayString = dateString(new Date());

  useEffect(() => {
    let cancelled = false;
    databaseService
      .getAllJournalEntries()
      .then((loadedEntries) => {
        if (!cancelled) setEntries(loadedEntries);
      })
      .catch((error) => console.error('Error loading journal entries:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const createdToday = new Set(
    entries.filter((entry) => entry.date === todayString).map((entry) => entry.journalType)
  );
  const availableToday = JOURNAL_TYPES.filter((journal) => !createdToday.has(journal.id));
  const countFor = (journalType: JournalTypeId) =>
    entries.filter((entry) => entry.journalType === journalType).length;
  const countForDate = (date: string) => entries.filter((entry) => entry.date === date).length;

  const openJournal = async (journal: JournalType, date = todayString) => {
    await databaseService.createJournalEntry(date, journal.id);
    onJournalSelect(date, journal.id);
  };

  const toggleCreateMenu = () => {
    if (availableToday.length === 1) {
      openJournal(availableToday[0]);
      return;
    }
    if (availableToday.length === 0) return;
    const nextOpen = !isCreateMenuOpen;
    setIsCreateMenuOpen(nextOpen);
    Animated.spring(menuAnimation, {
      toValue: nextOpen ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const markedDates = entries.reduce<
    Record<string, { marked: boolean; dotColor: string; selectedDotColor: string }>
  >((marks, entry) => {
    marks[entry.date] = { marked: true, dotColor: palette.teal, selectedDotColor: palette.surface };
    return marks;
  }, {});

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-1 px-5 pb-24 pt-7">
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-ink">Your journals</Text>
            <Text className="mt-1 text-sm text-muted">Choose a space to reflect and create.</Text>
          </View>
          <View className="h-12 w-12 rounded-full bg-ink" />
        </View>

        {activeTab === 'home' && (
          <View>
            {JOURNAL_TYPES.map((journal) => (
              <TouchableOpacity
                key={journal.id}
                onPress={() => openJournal(journal)}
                className="mb-3 rounded-xl border border-line p-4"
                style={{ backgroundColor: journal.softColor }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-bold text-ink">{journal.name}</Text>
                    <Text className="mt-1 text-sm text-muted">{journal.description}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xl font-bold" style={{ color: journal.accentColor }}>
                      {countFor(journal.id)}
                    </Text>
                    <Text className="text-xs text-muted">completed</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'calendar' && (
          <View className="pt-1">
            <Text className="mb-2 text-lg font-bold text-ink">Calendar</Text>
            <Text className="mb-4 text-sm text-muted">
              Completed journals are marked on each day.
            </Text>
            <View className="mb-4 flex-row flex-wrap">
              {JOURNAL_TYPES.map((journal) => (
                <View
                  key={journal.id}
                  className="mb-2 mr-2 rounded-full px-3 py-1"
                  style={{ backgroundColor: journal.softColor }}>
                  <Text className="text-xs font-bold" style={{ color: journal.accentColor }}>
                    {journal.name}: {countFor(journal.id)}
                  </Text>
                </View>
              ))}
            </View>
            <View className="rounded-lg border border-line bg-paper p-2">
              <Calendar
                onDayPress={(day) => {
                  const entry = entries.find((item) => item.date === day.dateString);
                  if (entry) onJournalSelect(entry.date, entry.journalType);
                  else openJournal(JOURNAL_TYPES[0], day.dateString);
                }}
                markedDates={markedDates}
                dayComponent={({ date, state }) => (
                  <TouchableOpacity
                    disabled={state === 'disabled'}
                    onPress={() => {
                      if (date) {
                        const entry = entries.find((item) => item.date === date.dateString);
                        if (entry) onJournalSelect(entry.date, entry.journalType);
                        else openJournal(JOURNAL_TYPES[0], date.dateString);
                      }
                    }}
                    className="items-center justify-center py-1">
                    <Text style={{ color: state === 'disabled' ? palette.disabled : palette.ink }}>
                      {date?.day}
                    </Text>
                    {date && countForDate(date.dateString) > 0 && (
                      <Text style={{ color: palette.teal, fontSize: 10 }}>
                        {countForDate(date.dateString)}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                theme={{
                  calendarBackground: palette.paper,
                  textSectionTitleColor: palette.subtle,
                  todayTextColor: palette.coral,
                  dayTextColor: palette.ink,
                  textDisabledColor: palette.disabled,
                  arrowColor: palette.ink,
                  monthTextColor: palette.ink,
                }}
              />
            </View>
          </View>
        )}
        {activeTab === 'notifications' && <View className="flex-1" />}
      </View>

      {isCreateMenuOpen && (
        <Animated.View
          style={[
            styles.createMenu,
            {
              opacity: menuAnimation,
              transform: [
                {
                  translateY: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
                {
                  scale: menuAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
                },
              ],
            },
          ]}>
          {availableToday.map((journal) => (
            <TouchableOpacity
              key={journal.id}
              onPress={() => {
                setIsCreateMenuOpen(false);
                openJournal(journal);
              }}
              className="flex-row items-center px-4 py-3">
              <View
                className="mr-3 h-3 w-3 rounded-full"
                style={{ backgroundColor: journal.accentColor }}
              />
              <Text className="text-sm font-bold text-ink">{journal.name}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}
      <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-paper px-2 pb-5 pt-2">
        <View className="flex-row items-center justify-around">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const color = isActive ? palette.ink : palette.muted;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                onPress={() =>
                  tab.key === 'create'
                    ? toggleCreateMenu()
                    : (setIsCreateMenuOpen(false), setActiveTab(tab.key))
                }
                className="min-w-[72px] items-center justify-center py-1">
                <Ionicons name={tab.icon} size={24} color={color} />
                <Text className="mt-1 text-xs font-bold" style={{ color }} numberOfLines={1}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  createMenu: {
    position: 'absolute',
    right: 8,
    bottom: 81,
    minWidth: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.paper,
    elevation: 12,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    zIndex: 10,
  },
});
