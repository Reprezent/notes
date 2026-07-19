import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { clearCurrentLog, readCurrentLog } from 'services/Logger';

interface DebugLogsScreenProps {
  onBack: () => void;
}

export const DebugLogsScreen: React.FC<DebugLogsScreenProps> = ({ onBack }) => {
  const [logs, setLogs] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      setLogs(await readCurrentLog());
    } catch {
      setLogs('Unable to read the current log file.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLogs();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadLogs]);

  const clearLogs = () => {
    Alert.alert('Clear logs?', 'This removes the current log file.', [
      { style: 'cancel', text: 'Cancel' },
      {
        style: 'destructive',
        text: 'Clear',
        onPress: () => {
          setIsLoading(true);
          void clearCurrentLog().then(loadLogs).catch(loadLogs);
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-canvas px-5 pt-14">
      <View className="mb-5 flex-row items-center justify-between">
        <TouchableOpacity onPress={onBack} className="rounded-lg bg-paper px-4 py-3">
          <Text className="font-bold text-ink">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => {
              setIsLoading(true);
              void loadLogs();
            }}
            className="rounded-lg bg-paper px-4 py-3">
            <Text className="font-bold text-ink">Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearLogs} className="rounded-lg bg-coral px-4 py-3">
            <Text className="font-bold text-white">Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text className="text-2xl font-bold text-ink">Debug logs</Text>
      <Text className="mb-4 mt-1 text-sm text-muted">Current app log file</Text>
      {isLoading ? (
        <ActivityIndicator />
      ) : (
        <ScrollView className="flex-1 rounded-lg bg-paper p-4">
          <Text selectable className="font-mono text-xs text-ink">
            {logs}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};
