import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { databaseService } from '../services/DatabaseService';
import { uiLog } from '../services/Logger';
import { palette } from './theme';

interface HomeScreenProps {
  onDateSelect: (date: string) => void;
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

export const HomeScreen: React.FC<HomeScreenProps> = ({ onDateSelect }) => {
  const [activeTab, setActiveTab] = useState<HomeTab>('home');
  const [drawingDates, setDrawingDates] = useState<string[]>([]);

  useEffect(() => {
    loadDrawingDates();
  }, []);

  const loadDrawingDates = async () => {
    try {
      const dates = await databaseService.getAllDrawingDates();
      setDrawingDates(dates);
    } catch (error) {
      console.error('Error loading drawing dates:', error);
    }
  };

  const handleTodayEntryStart = () => {
    uiLog.info('Starting today journal entry', { date: todayString });
    onDateSelect(todayString);
  };

  const handleTabPress = (tab: (typeof tabs)[number]) => {
    if (tab.key === 'create') {
      handleTodayEntryStart();
      return;
    }

    setActiveTab(tab.key);
  };

  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const markedDates: Record<
    string,
    { marked: boolean; dotColor: string; selectedDotColor: string }
  > = drawingDates.reduce(
    (acc, date) => ({
      ...acc,
      [date]: {
        marked: true,
        dotColor: palette.teal,
        selectedDotColor: palette.surface,
      },
    }),
    {}
  );

  markedDates[todayString] = {
    marked: true,
    dotColor: drawingDates.includes(todayString) ? palette.coral : palette.amber,
    selectedDotColor: palette.surface,
  };

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-1 px-5 pb-24 pt-7">
        <View className="items-end">
          <View className="h-12 w-12 rounded-full bg-ink" />
        </View>

        {activeTab === 'calendar' && (
          <View className="items-center pt-5">
            <Text className="mb-5 text-base font-semibold text-teal">Tell me about your day.</Text>
            <View className="w-full max-w-[360px] rounded-lg border border-line bg-paper p-2">
              <Calendar
                onDayPress={(day) => {
                  uiLog.info('Date selected', { date: day.dateString });
                  onDateSelect(day.dateString);
                }}
                markedDates={markedDates}
                theme={{
                  backgroundColor: palette.border,
                  calendarBackground: palette.paper,
                  textSectionTitleColor: palette.subtle,
                  selectedDayBackgroundColor: palette.coral,
                  selectedDayTextColor: palette.surface,
                  todayTextColor: palette.coral,
                  dayTextColor: palette.ink,
                  textDisabledColor: palette.disabled,
                  dotColor: palette.teal,
                  selectedDotColor: palette.surface,
                  arrowColor: palette.ink,
                  monthTextColor: palette.ink,
                  indicatorColor: palette.coral,
                  textDayFontFamily: 'System',
                  textMonthFontFamily: 'System',
                  textDayHeaderFontFamily: 'System',
                  textDayFontWeight: '500',
                  textMonthFontWeight: 'bold',
                  textDayHeaderFontWeight: '700',
                  textDayFontSize: 16,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
                style={{ borderRadius: 8 }}
              />
            </View>
          </View>
        )}

        {activeTab === 'notifications' && <View className="flex-1" />}
      </View>

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
                onPress={() => handleTabPress(tab)}
                className="min-w-[72px] items-center justify-center py-1">
                <Ionicons name={tab.icon} size={24} color={color} />
                <Text
                  className="mt-1 text-xs font-bold"
                  style={[styles.tabLabel, { color }]}
                  numberOfLines={1}>
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
  tabLabel: {
    maxWidth: 86,
  },
});
