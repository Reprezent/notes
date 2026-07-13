import React, { useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { databaseService, JournalEntry } from '../services/DatabaseService';
import { JOURNAL_TYPES, JournalType, JournalTypeId } from '../services/JournalTypes';
import { palette } from './theme';

interface HomeScreenProps {
  onJournalSelect: (date: string, journalType: JournalTypeId) => void;
}

type HomeTab = 'home' | 'calendar' | 'notifications';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabs: { key: HomeTab | 'create'; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  { key: 'create', label: 'Create', icon: 'add-circle-outline' },
];

const journalIcons: Record<JournalTypeId, IconName> = {
  'daily-diary': 'sunny-outline',
  gratitude: 'heart-outline',
  'artists-notes': 'color-palette-outline',
  inspiration: 'bulb-outline',
};

const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dayBefore = (date: Date) => {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return previous;
};

const getStreaks = (entries: JournalEntry[], today: Date) => {
  const journaledDays = new Set(entries.map((entry) => entry.date));
  let currentStreak = 0;
  let currentDate = new Date(today);

  while (journaledDays.has(dateString(currentDate))) {
    currentStreak += 1;
    currentDate = dayBefore(currentDate);
  }

  const sortedDays = Array.from(journaledDays).sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDay: Date | null = null;

  sortedDays.forEach((day) => {
    const [year, month, date] = day.split('-').map(Number);
    const journalDate = new Date(year, month - 1, date);

    if (previousDay && dateString(dayBefore(journalDate)) === dateString(previousDay)) {
      runningStreak += 1;
    } else {
      runningStreak = 1;
    }

    longestStreak = Math.max(longestStreak, runningStreak);
    previousDay = journalDate;
  });

  return { currentStreak, longestStreak, daysJournaled: journaledDays.size };
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ onJournalSelect }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>('home');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [menuAnimation] = useState(() => new Animated.Value(0));
  const today = new Date();
  const todayString = dateString(today);

  useEffect(() => {
    let cancelled = false;

    databaseService
      .getAllJournalEntries()
      .then((loadedEntries) => {
        if (!cancelled) {
          setEntries(loadedEntries);
        }
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
  const { currentStreak, longestStreak, daysJournaled } = getStreaks(entries, today);

  const openJournal = async (journal: JournalType, date = todayString) => {
    await databaseService.createJournalEntry(date, journal.id);
    onJournalSelect(date, journal.id);
  };

  const toggleCreateMenu = () => {
    if (availableToday.length === 1) {
      openJournal(availableToday[0]);
      return;
    }

    if (availableToday.length === 0) {
      return;
    }

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

  const progressCards: {
    label: string;
    value: number;
    icon: IconName;
    color: string;
    softColor: string;
  }[] = [
    {
      label: 'Current streak',
      value: currentStreak,
      icon: 'flame-outline',
      color: palette.teal,
      softColor: palette.tealSoft,
    },
    {
      label: 'Days journaled',
      value: daysJournaled,
      icon: 'book-outline',
      color: palette.accent,
      softColor: palette.accentSoft,
    },
    {
      label: 'Longest streak',
      value: longestStreak,
      icon: 'trophy-outline',
      color: palette.tertiary,
      softColor: palette.tertiarySoft,
    },
  ];

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View className="mb-7 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold text-muted">JOURNAL SPACE</Text>
            <Text className="mt-1 text-lg font-bold text-ink">A moment for you</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-ink">
            <Text className="text-xl font-medium text-paper">F</Text>
          </View>
        </View>

        {activeTab === 'home' && (
          <>
            <View className="mb-8 overflow-hidden rounded-3xl bg-paper p-5">
              <View className="absolute -right-12 -top-10 h-48 w-48 rounded-full bg-teal-soft opacity-60" />
              <View className="absolute -right-1 top-5 h-32 w-32 rounded-full bg-amber-soft opacity-50" />
              <View className="max-w-[56%]">
                <Text style={styles.heroTitle}>Tell me about{`\n`}your day.</Text>
                <Text className="mt-3 text-base leading-6 text-muted">
                  Capture your thoughts, ideas, and moments in one place.
                </Text>
              </View>
              <View className="mt-7 flex-row items-end justify-end">
                <View className="bg-surface mr-3 h-14 w-11 rounded-b-2xl rounded-t-lg" />
                <View className="bg-surface h-20 w-28 rounded-lg border border-line p-2">
                  <View className="bg-paper-line mb-2 h-1 w-16 rounded-full" />
                  <View className="bg-paper-line mb-2 h-1 w-20 rounded-full" />
                  <View className="bg-paper-line h-1 w-12 rounded-full" />
                </View>
                <View className="-ml-3 mb-10 h-16 w-10 items-center justify-center rounded-t-full bg-teal-soft">
                  <Ionicons name="leaf-outline" size={26} color={palette.teal} />
                </View>
              </View>
            </View>

            <View className="mb-4 flex-row items-center">
              <Ionicons name="stats-chart-outline" size={22} color={palette.ink} />
              <Text className="ml-2 text-lg font-bold text-ink">Your progress</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-5"
              contentContainerStyle={styles.progressCardsContent}>
              {progressCards.map((card) => (
                <View key={card.label} style={styles.progressCard}>
                  <Text className="text-sm text-muted">{card.label}</Text>
                  <View className="mt-4 flex-row items-center">
                    <View
                      className="mr-3 h-11 w-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: card.softColor }}>
                      <Ionicons name={card.icon} size={23} color={card.color} />
                    </View>
                    <View>
                      <Text className="text-3xl font-bold text-ink">{card.value}</Text>
                      <Text className="text-sm text-muted">days</Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View className="mb-8 flex-row items-center justify-center">
              <Ionicons name="leaf-outline" size={18} color={palette.teal} />
              <Text className="ml-2 text-sm text-muted">Consistency builds clarity.</Text>
            </View>

            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <View className="flex-row items-center">
                  <Ionicons name="book-outline" size={22} color={palette.ink} />
                  <Text className="ml-2 text-lg font-bold text-ink">Choose a journal</Text>
                </View>
                <Text className="mt-1 text-sm text-muted">Pick a journal to start writing.</Text>
              </View>
              <View className="rounded-lg border border-line px-3 py-2">
                <Text className="font-bold text-teal">Manage</Text>
              </View>
            </View>

            <View className="overflow-hidden rounded-2xl border border-line bg-paper">
              {JOURNAL_TYPES.map((journal, index) => (
                <TouchableOpacity
                  key={journal.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${journal.name}`}
                  onPress={() => openJournal(journal)}
                  style={index < JOURNAL_TYPES.length - 1 ? styles.journalRowBorder : undefined}
                  className="flex-row items-center px-4 py-4">
                  <View
                    className="mr-3 h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: journal.softColor }}>
                    <Ionicons
                      name={journalIcons[journal.id]}
                      size={24}
                      color={journal.accentColor}
                    />
                  </View>
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-bold text-ink">{journal.name}</Text>
                    <Text className="mt-1 text-sm text-muted">{journal.description}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-bold" style={{ color: journal.accentColor }}>
                      {countFor(journal.id)}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={palette.subtle} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create a new journal entry"
              onPress={toggleCreateMenu}
              className="mt-4 flex-row items-center justify-center rounded-2xl border border-dashed border-line py-4">
              <Ionicons name="add" size={24} color={palette.teal} />
              <Text className="ml-2 text-base font-bold text-teal">Create new journal</Text>
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'calendar' && (
          <View className="pt-1">
            <Text className="mb-2 text-2xl font-bold text-ink">Calendar</Text>
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
            <View className="rounded-2xl border border-line bg-paper p-2">
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
                      if (!date) return;
                      const entry = entries.find((item) => item.date === date.dateString);
                      if (entry) onJournalSelect(entry.date, entry.journalType);
                      else openJournal(JOURNAL_TYPES[0], date.dateString);
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
      </ScrollView>

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
                onPress={() => {
                  if (tab.key === 'create') {
                    toggleCreateMenu();
                  } else {
                    setIsCreateMenuOpen(false);
                    setActiveTab(tab.key);
                  }
                }}
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 108,
  },
  createMenu: {
    position: 'absolute',
    right: 8,
    bottom: 81,
    minWidth: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.paper,
    zIndex: 10,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 18px rgba(27, 58, 52, 0.14)',
      },
      default: {
        elevation: 12,
        shadowColor: palette.ink,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
    }),
  },
  heroTitle: {
    color: '#234237',
    fontFamily: 'serif',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 40,
  },
  journalRowBorder: {
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressCardsContent: {
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  progressCard: {
    backgroundColor: palette.paper,
    borderRadius: 18,
    marginRight: 12,
    padding: 16,
    width: 176,
    ...Platform.select({
      web: {
        boxShadow: '0px 6px 14px -3px rgba(27, 58, 52, 0.12)',
      },
      default: {
        elevation: 2,
        shadowColor: palette.ink,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
    }),
  },
});
