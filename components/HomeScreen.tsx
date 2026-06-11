import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { databaseService } from '../services/DatabaseService';
import { uiLog } from '../services/Logger';
import { palette } from './theme';

interface HomeScreenProps {
  onDateSelect: (date: string) => void;
  onOpenMenu: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onDateSelect, onOpenMenu }) => {
  const [userName, setUserName] = useState('Guest');
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState('');
  const [drawingDates, setDrawingDates] = useState<string[]>([]);

  useEffect(() => {
    loadUserName();
    loadDrawingDates();
  }, []);

  const loadUserName = async () => {
    try {
      const saved = await AsyncStorage.getItem('userName');
      if (saved) {
        setUserName(saved);
      }
    } catch (error) {
      console.error('Error loading user name:', error);
    }
  };

  const loadDrawingDates = async () => {
    try {
      const dates = await databaseService.getAllDrawingDates();
      setDrawingDates(dates);
    } catch (error) {
      console.error('Error loading drawing dates:', error);
    }
  };

  const saveUserName = async (name: string) => {
    try {
      uiLog.info('Saving user name', { name: name.substring(0, 10) + '...' }); // Log only first 10 chars for privacy
      await AsyncStorage.setItem('userName', name);
      setUserName(name);
      uiLog.debug('User name saved successfully');
    } catch (error) {
      uiLog.error('Error saving user name:', error);
    }
  };

  const handleEditStart = () => {
    uiLog.debug('User started editing name');
    setTempName(userName);
    setIsEditing(true);
  };

  const handleEditSave = () => {
    if (tempName.trim()) {
      saveUserName(tempName.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setTempName('');
    setIsEditing(false);
  };

  const handleTodayEntryStart = () => {
    uiLog.info('Starting today journal entry', { date: todayString });
    onDateSelect(todayString);
  };

  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const entryCount = drawingDates.length;
  const compactTodayLabel = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const entryLabel = entryCount === 1 ? 'entry' : 'entries';
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
      <View className="border-b border-line bg-paper px-4 py-3">
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center pr-2">
            <TouchableOpacity
              onPress={onOpenMenu}
              className="mr-3 h-11 w-11 items-center justify-center rounded-lg bg-paper">
              <Ionicons name="menu" size={24} color={palette.ink} />
            </TouchableOpacity>

            <View className="flex-1 flex-row items-center">
              {isEditing ? (
                <View className="flex-row items-center">
                  <Text className="text-lg font-bold text-ink">Hello </Text>
                  <TextInput
                    value={tempName}
                    onChangeText={setTempName}
                    onSubmitEditing={handleEditSave}
                    onBlur={handleEditCancel}
                    autoFocus
                    className="min-w-[100px] border-b-2 border-lavender text-center text-lg font-bold text-lavender"
                    placeholder="Your name"
                    placeholderTextColor={palette.subtle}
                  />
                  <Text className="text-lg font-bold text-ink">!</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={handleEditStart} className="flex-row items-center">
                  <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                    Hello <Text className="text-lavender">{userName}</Text>!
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View className="flex-row rounded-lg bg-canvas p-1" style={{ columnGap: 4 }}>
            <View className="rounded-lg bg-teal-soft px-3 py-2">
              <Text className="text-base font-bold text-ink" numberOfLines={1}>
                {entryCount} <Text className="text-sm text-muted">{entryLabel}</Text>
              </Text>
            </View>

            <View className="rounded-lg bg-coral-soft px-3 py-2">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                {compactTodayLabel}
              </Text>
            </View>
          </View>

          <View className="flex-1" />
        </View>
      </View>

      <View className="flex-1 px-5 pb-5">
        <View
          className="bg-surface border border-line p-2"
          style={{
            alignSelf: 'center',
            borderRadius: 8,
            shadowColor: palette.lavender,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.08,
            shadowRadius: 14,
            elevation: 2,
            maxWidth: 1040,
            width: '100%',
          }}>
          <Calendar
            onDayPress={(day) => {
              uiLog.info('Date selected', { date: day.dateString });
              onDateSelect(day.dateString);
            }}
            markedDates={markedDates}
            theme={{
              backgroundColor: palette.border,
              calendarBackground: palette.background,
              textSectionTitleColor: palette.subtle,
              selectedDayBackgroundColor: palette.coral,
              selectedDayTextColor: palette.surface,
              todayTextColor: palette.coral,
              dayTextColor: palette.ink,
              textDisabledColor: palette.disabled,
              dotColor: palette.teal,
              selectedDotColor: palette.surface,
              arrowColor: palette.lavender,
              monthTextColor: palette.ink,
              indicatorColor: palette.coral,
              textDayFontFamily: 'System',
              textMonthFontFamily: 'System',
              textDayHeaderFontFamily: 'System',
              textDayFontWeight: '500',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '700',
              textDayFontSize: 16,
              textMonthFontSize: 19,
              textDayHeaderFontSize: 13,
            }}
            style={{ borderRadius: 8 }}
          />
          <View className="mb-2 flex-row items-center justify-end px-2 pt-2">
            <View className="flex-row items-center rounded-lg bg-coral-soft px-2 py-1">
              <View className="mr-2 h-2 w-2 rounded-full bg-teal" />
              <Text className="text-xs font-semibold text-muted">Saved days</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.86}
        accessibilityLabel="Start today's journal entry"
        onPress={handleTodayEntryStart}
        className="absolute bottom-6 right-6 h-16 w-16 items-center justify-center rounded-full bg-coral"
        style={{
          elevation: 8,
          shadowColor: palette.coral,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.28,
          shadowRadius: 12,
        }}>
        <Ionicons name="add" size={34} color={palette.surface} />
      </TouchableOpacity>
    </View>
  );
};
