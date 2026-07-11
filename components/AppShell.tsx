import React, { ComponentProps, ReactNode, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from './theme';

export interface AppMenuItem {
  label: string;
  description?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

interface AppShellProps {
  children: (openMenu: () => void) => ReactNode;
  menuItems: AppMenuItem[];
}

export const AppShell: React.FC<AppShellProps> = ({ children, menuItems }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMenuItemPress = (item: AppMenuItem) => {
    setIsMenuOpen(false);
    item.onPress();
  };

  return (
    <View className="flex-1 bg-canvas" style={{ position: 'relative' }}>
      {children(() => setIsMenuOpen(true))}

      {isMenuOpen && (
        <View style={styles.drawerHost}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsMenuOpen(false)}
            style={styles.drawerOverlay}
          />
          <View className="border-r border-line bg-paper p-4" style={styles.drawer}>
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-semibold uppercase text-coral">Menu</Text>
                <Text className="mt-1 text-2xl font-bold text-ink">Notes</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsMenuOpen(false)}
                className="h-10 w-10 items-center justify-center rounded-lg bg-canvas">
                <Ionicons name="close" size={22} color={palette.muted} />
              </TouchableOpacity>
            </View>

            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => handleMenuItemPress(item)}
                className="mb-2 flex-row items-center rounded-lg bg-canvas px-3 py-3">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-lg bg-lavender-soft">
                  <Ionicons name={item.icon} size={21} color={palette.lavender} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-ink">{item.label}</Text>
                  {item.description && (
                    <Text className="mt-1 text-xs font-semibold text-muted">
                      {item.description}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  drawer: {
    bottom: 0,
    elevation: 24,
    left: 0,
    maxWidth: 320,
    position: 'absolute',
    shadowColor: palette.ink,
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    top: 0,
    width: '82%',
  },
  drawerHost: {
    bottom: 0,
    elevation: 50,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 50,
  },
  drawerOverlay: {
    backgroundColor: 'rgba(47, 42, 58, 0.28)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
