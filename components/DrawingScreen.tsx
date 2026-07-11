import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import Svg, { Defs, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { databaseService } from '../services/DatabaseService';
import { ImportedJournalContent } from '../services/ImportTypes';
import { getJournalType, JournalTypeId } from '../services/JournalTypes';
import { drawingLog, uiLog } from '../services/Logger';
import { textToSvgService } from '../services/TextToSvgService';
import { drawingColors, palette } from './theme';

// Smooth a path using quadratic curves
const smoothPath = (points: { x: number; y: number }[]): string => {
  if (points.length < 2) return '';

  uiLog.debug('Smoothing path with points', { pointCount: points.length });
  let path = `M ${points[0].x} ${points[0].y}`;

  // If only two points, use simple line
  if (points.length === 2) {
    path += ` L ${points[1].x} ${points[1].y}`;
    return path;
  }

  // Use quadratic curves for smoothing
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    // Control point is the current point
    const controlX = current.x;
    const controlY = current.y;

    // End point is midway to next point
    const endX = (current.x + next.x) / 2;
    const endY = (current.y + next.y) / 2;

    path += ` Q ${controlX} ${controlY} ${endX} ${endY}`;
  }

  // Add final point
  const lastPoint = points[points.length - 1];
  path += ` L ${lastPoint.x} ${lastPoint.y}`;

  return path;
};

interface DrawingScreenProps {
  date: string;
  journalType: JournalTypeId;
  onBack: () => void;
}

interface DrawingPath {
  path: string;
  color: string;
  strokeWidth: number;
}

const strokeWidths = [1, 3, 6, 10];

export const DrawingScreen: React.FC<DrawingScreenProps> = ({ date, journalType, onBack }) => {
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState(drawingColors[0]);
  const [selectedTool, setSelectedTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [activeToolOptions, setActiveToolOptions] = useState<'pen' | 'eraser' | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [importedContent, setImportedContent] = useState<ImportedJournalContent | null>(null);
  const [isImportingImage, setIsImportingImage] = useState(false);
  const [transcribedTextDraft, setTranscribedTextDraft] = useState('');

  const { width, height } = Dimensions.get('window');
  const drawingHeight = Math.max(height - 150, 320);
  const [canvasWidth, setCanvasWidth] = useState(width);
  const [canvasHeight, setCanvasHeight] = useState(drawingHeight);

  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const canvasWidthRef = useRef(canvasWidth);
  const canvasHeightRef = useRef(canvasHeight);
  const isPanningRef = useRef(isPanning);
  const lastPanPointRef = useRef(lastPanPoint);

  useEffect(() => {
    let cancelled = false;

    drawingLog.info('Loading drawing', { date });
    databaseService
      .loadDrawing(date, journalType)
      .then((savedPaths) => {
        if (!cancelled) {
          setPaths(savedPaths);
          drawingLog.debug('Drawing loaded', { date, pathCount: savedPaths.length });
        }
      })
      .catch((error) => {
        drawingLog.error('Error loading drawing', { date, error });
      });

    return () => {
      cancelled = true;
    };
  }, [date, journalType]);

  useEffect(() => {
    let cancelled = false;

    databaseService
      .loadImportedJournalContent(date, journalType)
      .then((content) => {
        if (!cancelled) {
          setImportedContent(content);
          setTranscribedTextDraft(content?.transcribedText ?? '');
        }
      })
      .catch((error) =>
        drawingLog.error('Error loading imported journal content', { date, error })
      );

    return () => {
      cancelled = true;
    };
  }, [date, journalType]);

  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
    canvasWidthRef.current = canvasWidth;
    canvasHeightRef.current = canvasHeight;
    isPanningRef.current = isPanning;
    lastPanPointRef.current = lastPanPoint;
  }, [zoom, panX, panY, canvasWidth, canvasHeight, isPanning, lastPanPoint]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const svgElement = target?.closest?.('svg');
      if (svgElement) {
        event.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isEventOnSvg = (event: MouseEvent) => {
      const target = event.target as Element | null;
      return Boolean(target?.closest?.('svg'));
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 2 || !isEventOnSvg(event)) {
        return;
      }

      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      setIsPanning(true);
      isPanningRef.current = true;
      setIsDrawing(false);
      setLastPanPoint(point);
      lastPanPointRef.current = point;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isPanningRef.current || !lastPanPointRef.current) {
        return;
      }

      event.preventDefault();
      const currentPoint = { x: event.clientX, y: event.clientY };
      const deltaX = currentPoint.x - lastPanPointRef.current.x;
      const deltaY = currentPoint.y - lastPanPointRef.current.y;

      setPanX((prev) => prev + deltaX);
      setPanY((prev) => prev + deltaY);
      setLastPanPoint(currentPoint);
      lastPanPointRef.current = currentPoint;
    };

    const stopPanning = () => {
      if (!isPanningRef.current) {
        return;
      }

      setIsPanning(false);
      isPanningRef.current = false;
      setLastPanPoint(null);
      lastPanPointRef.current = null;
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', stopPanning, true);
    window.addEventListener('blur', stopPanning);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', stopPanning, true);
      window.removeEventListener('blur', stopPanning);
    };
  }, []);

  const saveDrawing = async (newPaths: DrawingPath[]) => {
    try {
      drawingLog.info('Saving drawing', { date, pathCount: newPaths.length });
      await databaseService.saveDrawing(date, journalType, newPaths);
      drawingLog.debug('Drawing saved successfully', { date });
    } catch (error) {
      drawingLog.error('Error saving drawing', { date, error });
    }
  };

  const handleWheel = (event: WheelEvent) => {
    const target = event.target as Element | null;
    const svgElement = target?.closest?.('svg');
    if (!svgElement) {
      return;
    }

    event.preventDefault();

    const currentZoom = zoomRef.current;
    const currentPanX = panXRef.current;
    const currentPanY = panYRef.current;
    const currentCanvasWidth = canvasWidthRef.current;
    const currentCanvasHeight = canvasHeightRef.current;

    const delta = event.deltaY;
    const zoomStep = 1.12;
    const zoomMultiplier = delta > 0 ? 1 / zoomStep : zoomStep;
    const newZoom = Math.max(0.5, Math.min(5, currentZoom * zoomMultiplier));

    if (newZoom === currentZoom) {
      return;
    }

    // On web, keep the point under the cursor fixed while zooming.
    const rect = svgElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const normalizedX = mouseX / rect.width;
    const normalizedY = mouseY / rect.height;

    const currentViewBoxX = -currentPanX / currentZoom;
    const currentViewBoxY = -currentPanY / currentZoom;
    const currentViewBoxWidth = currentCanvasWidth / currentZoom;
    const currentViewBoxHeight = currentCanvasHeight / currentZoom;

    const worldX = currentViewBoxX + normalizedX * currentViewBoxWidth;
    const worldY = currentViewBoxY + normalizedY * currentViewBoxHeight;

    const newViewBoxWidth = currentCanvasWidth / newZoom;
    const newViewBoxHeight = currentCanvasHeight / newZoom;
    const newViewBoxX = worldX - normalizedX * newViewBoxWidth;
    const newViewBoxY = worldY - normalizedY * newViewBoxHeight;

    const newPanX = -newViewBoxX * newZoom;
    const newPanY = -newViewBoxY * newZoom;

    setPanX(newPanX);
    setPanY(newPanY);
    setZoom(newZoom);
    uiLog.debug('Zoom changed', { oldZoom: currentZoom, newZoom, delta, mouseX, mouseY });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        window.removeEventListener('wheel', handleWheel);
      };
    }
  }, []);

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    if (layoutWidth > 0 && layoutHeight > 0) {
      setCanvasWidth(layoutWidth);
      setCanvasHeight(layoutHeight);
    }
  };

  const getPointerPosition = (event: any) => ({
    x:
      typeof event.nativeEvent.pageX === 'number'
        ? event.nativeEvent.pageX
        : event.nativeEvent.locationX,
    y:
      typeof event.nativeEvent.pageY === 'number'
        ? event.nativeEvent.pageY
        : event.nativeEvent.locationY,
  });

  const isSecondaryButtonEvent = (event: any) => {
    const nativeEvent = event.nativeEvent as any;
    const button = nativeEvent.button;
    const buttons = nativeEvent.buttons;

    return button === 2 || (typeof buttons === 'number' && (buttons & 2) === 2);
  };

  const resetZoom = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    uiLog.debug('Zoom reset to default');
  };

  const handleToolSelect = (tool: 'pen' | 'eraser') => {
    setSelectedTool(tool);
    setIsMoreMenuOpen(false);
    setActiveToolOptions((currentTool) => (currentTool === tool ? null : tool));
  };

  const handleMoreToggle = () => {
    setActiveToolOptions(null);
    setIsMoreMenuOpen((isOpen) => !isOpen);
  };

  const handleCameraAction = () => {
    setIsMoreMenuOpen(false);
    takePicture();
  };

  const handleResetZoomAction = () => {
    setIsMoreMenuOpen(false);
    resetZoom();
  };

  const handleClearCanvasAction = () => {
    setIsMoreMenuOpen(false);
    clearCanvas();
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (event) => {
      setActiveToolOptions(null);
      setIsMoreMenuOpen(false);

      const isRightClick = isSecondaryButtonEvent(event);
      if (isRightClick) {
        const pointer = getPointerPosition(event);
        setIsPanning(true);
        setIsDrawing(false);
        setLastPanPoint(pointer);
        return;
      }

      const { locationX, locationY } = event.nativeEvent;
      // Transform screen coordinates to SVG coordinates
      const svgX = -panX / zoom + locationX / zoom;
      const svgY = -panY / zoom + locationY / zoom;
      uiLog.debug('Started drawing', {
        tool: selectedTool,
        color: selectedColor,
        strokeWidth,
        x: svgX,
        y: svgY,
      });
      const startPoint = { x: svgX, y: svgY };
      setCurrentPoints([startPoint]);
      setCurrentPath(`M${svgX},${svgY}`);
      setIsDrawing(true);
    },

    onPanResponderMove: (event) => {
      if (isPanning && lastPanPoint) {
        const currentPoint = getPointerPosition(event);
        const deltaX = currentPoint.x - lastPanPoint.x;
        const deltaY = currentPoint.y - lastPanPoint.y;

        setPanX((prev) => prev + deltaX);
        setPanY((prev) => prev + deltaY);
        setLastPanPoint(currentPoint);
        return;
      }

      const { locationX, locationY } = event.nativeEvent;
      if (isDrawing) {
        // Transform screen coordinates to SVG coordinates
        const svgX = -panX / zoom + locationX / zoom;
        const svgY = -panY / zoom + locationY / zoom;
        const newPoint = { x: svgX, y: svgY };
        setCurrentPoints((prev) => {
          const newPoints = [...prev, newPoint];
          // Update current path with smoothing
          setCurrentPath(smoothPath(newPoints));
          return newPoints;
        });
      }
    },

    onPanResponderRelease: () => {
      if (isPanning) {
        setIsPanning(false);
        setLastPanPoint(null);
        return;
      }

      if (currentPath && isDrawing) {
        uiLog.debug('Finished drawing path', {
          tool: selectedTool,
          pathLength: currentPath.length,
        });
        const newDrawingPath: DrawingPath = {
          path: currentPath,
          color: selectedTool === 'eraser' ? palette.surface : selectedColor,
          strokeWidth: selectedTool === 'eraser' ? strokeWidth * 3 : strokeWidth,
        };

        const newPaths = [...paths, newDrawingPath];
        setPaths(newPaths);
        saveDrawing(newPaths);
        setCurrentPath('');
        setCurrentPoints([]);
        setIsDrawing(false);
      }
    },

    onPanResponderTerminate: () => {
      setIsPanning(false);
      setLastPanPoint(null);
      setIsDrawing(false);
      setCurrentPath('');
      setCurrentPoints([]);
    },
  });

  const clearDrawing = async () => {
    try {
      setPaths([]);
      setCurrentPath('');
      setCurrentPoints([]);
      setIsDrawing(false);
      setImportedContent(null);
      setTranscribedTextDraft('');
      await databaseService.deleteDrawing(date, journalType);
      drawingLog.info('Drawing cleared', { date });
    } catch (error) {
      drawingLog.error('Error clearing drawing', { date, error });
    }
  };

  const clearCanvas = () => {
    if (Platform.OS === 'web') {
      const shouldClear = window.confirm('Clear this drawing?');
      if (shouldClear) {
        clearDrawing();
      }
      return;
    }

    Alert.alert('Clear Drawing', 'Are you sure you want to clear this drawing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: clearDrawing,
      },
    ]);
  };

  const captureImage = async (): Promise<string | null> => {
    if (Platform.OS !== 'web') {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission required',
          'Camera permission is required to import journal pages.'
        );
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return null;
      }

      return result.assets[0].uri;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return null;
    }

    return result.assets[0].uri;
  };

  const saveImportedContent = async (content: ImportedJournalContent) => {
    await databaseService.saveImportedJournalContent(content);
    await databaseService.createJournalEntry(date, journalType);
    setImportedContent(content);
  };

  const takePicture = async () => {
    setIsImportingImage(true);
    try {
      const sourceImageUri = await captureImage();
      if (!sourceImageUri) {
        return;
      }

      const nextContent: ImportedJournalContent = {
        date,
        journalType,
        sourceImageUri,
        transcribedText: importedContent?.transcribedText ?? '',
      };

      await saveImportedContent(nextContent);
      setTranscribedTextDraft(nextContent.transcribedText);
      Alert.alert(
        'Page imported',
        'Your journal page was added. Type the text you want rendered into the journal canvas.'
      );
    } catch (error) {
      drawingLog.error('Error importing journal page', { date, error });
      Alert.alert('Import failed', 'We could not import that journal page. Please try again.');
    } finally {
      setIsImportingImage(false);
    }
  };

  const saveTranscribedText = async () => {
    if (!importedContent) {
      return;
    }

    try {
      const nextContent: ImportedJournalContent = {
        ...importedContent,
        transcribedText: transcribedTextDraft,
      };
      await saveImportedContent(nextContent);
      Alert.alert('Text saved', 'Your transcribed text is now rendered in the journal.');
    } catch (error) {
      drawingLog.error('Error saving transcribed text', { date, error });
      Alert.alert('Save failed', 'We could not save your transcribed text.');
    }
  };

  const formatDate = (dateString: string) => {
    // Parse the date string as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    const formatted = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return formatted;
  };

  const formattedDate = formatDate(date);
  const journal = getJournalType(journalType);
  const importedTextLines = textToSvgService.createLines(transcribedTextDraft);
  const toolOptionsPanelWidth = Math.max(
    220,
    Math.min(width - 32, activeToolOptions === 'pen' ? 430 : 320)
  );

  return (
    <View className="flex-1 bg-canvas">
      <View className="border-b border-line bg-paper px-4 py-3" style={{ zIndex: 10 }}>
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center pr-2">
            <TouchableOpacity
              onPress={onBack}
              className="mr-3 h-11 w-11 items-center justify-center rounded-lg bg-sky-soft">
              <Ionicons name="arrow-back" size={23} color={palette.sky} />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink" numberOfLines={1}>
                {journal.name}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {formattedDate}
              </Text>
            </View>
          </View>

          <View className="flex-row rounded-lg bg-canvas p-1" style={{ position: 'relative' }}>
            <TouchableOpacity
              onPress={() => handleToolSelect('pen')}
              className={`mr-1 h-11 w-11 items-center justify-center rounded-lg ${
                selectedTool === 'pen' ? 'bg-teal' : 'bg-transparent'
              }`}>
              <Ionicons
                name="pencil-outline"
                size={22}
                color={selectedTool === 'pen' ? palette.surface : palette.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleToolSelect('eraser')}
              className={`mr-1 h-11 w-11 items-center justify-center rounded-lg ${
                selectedTool === 'eraser' ? 'bg-lavender' : 'bg-transparent'
              }`}>
              <Ionicons
                name="remove-circle-outline"
                size={22}
                color={selectedTool === 'eraser' ? palette.surface : palette.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMoreToggle}
              className={`h-11 w-11 items-center justify-center rounded-lg ${
                isMoreMenuOpen ? 'bg-amber-soft' : 'bg-transparent'
              }`}>
              <Ionicons name="ellipsis-horizontal" size={23} color={palette.muted} />
            </TouchableOpacity>

            {isMoreMenuOpen && (
              <View className="border border-line bg-paper p-2" style={styles.moreMenu}>
                <TouchableOpacity
                  onPress={handleCameraAction}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="camera-outline" size={20} color={palette.sky} />
                  <Text className="ml-3 text-sm font-bold text-ink">Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleResetZoomAction}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="contract-outline" size={20} color={palette.lavender} />
                  <Text className="ml-3 text-sm font-bold text-ink">Reset zoom</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearCanvasAction}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="trash-outline" size={20} color={palette.danger} />
                  <Text className="ml-3 text-sm font-bold text-ink">Clear drawing</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeToolOptions && (
              <View
                className="border border-line bg-paper p-3"
                style={[
                  styles.toolOptionsMenu,
                  {
                    transform: [{ translateX: -toolOptionsPanelWidth / 2 }],
                    width: toolOptionsPanelWidth,
                  },
                ]}>
                {activeToolOptions === 'pen' && (
                  <View className="mb-3 flex-row flex-wrap justify-center">
                    {drawingColors.map((color) => (
                      <TouchableOpacity
                        key={color}
                        onPress={() => setSelectedColor(color)}
                        className={`mb-2 mr-2 h-9 w-9 items-center justify-center rounded-full border-2 ${
                          selectedColor === color ? 'border-ink' : 'border-line'
                        }`}
                        style={{ backgroundColor: color }}>
                        {selectedColor === color && (
                          <Ionicons name="checkmark" size={17} color={palette.surface} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View className="flex-row items-center justify-center">
                  <Text className="mr-3 text-sm font-semibold text-muted">
                    {activeToolOptions === 'eraser' ? 'Eraser size' : 'Stroke'}
                  </Text>
                  {strokeWidths.map((strokeOption) => (
                    <TouchableOpacity
                      key={strokeOption}
                      onPress={() => setStrokeWidth(strokeOption)}
                      className={`mr-2 h-11 w-11 items-center justify-center rounded-lg ${
                        strokeWidth === strokeOption ? 'bg-amber-soft' : 'bg-canvas'
                      }`}>
                      <View
                        className="rounded-full bg-ink"
                        style={{
                          height: strokeOption * 2 + 4,
                          width: strokeOption * 2 + 4,
                        }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View className="flex-1" />
        </View>
      </View>

      <View className="flex-1 bg-canvas p-4">
        {(isImportingImage || importedContent) && (
          <View className="mb-3 rounded-xl border border-line bg-paper p-3">
            {isImportingImage && (
              <View className="mb-2 flex-row items-center">
                <ActivityIndicator size="small" color={palette.teal} />
                <Text className="ml-2 text-sm font-semibold text-muted">Importing page...</Text>
              </View>
            )}
            {importedContent && (
              <>
                <Text className="mb-2 text-sm font-bold text-ink">Imported page</Text>
                <Image
                  source={{ uri: importedContent.sourceImageUri }}
                  className="mb-2 h-28 w-full rounded-lg"
                  resizeMode="cover"
                />
                <Text className="mb-2 text-sm font-semibold text-muted">Transcribed text</Text>
                <TextInput
                  multiline
                  value={transcribedTextDraft}
                  onChangeText={setTranscribedTextDraft}
                  placeholder="Type the journal text you want drawn into the page..."
                  placeholderTextColor={palette.subtle}
                  style={styles.transcriptionInput}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  onPress={saveTranscribedText}
                  className="mt-3 items-center rounded-lg bg-teal px-4 py-3">
                  <Text className="text-sm font-bold text-paper">Save text to journal</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View
          className="bg-surface overflow-hidden border border-line"
          style={{
            flex: 1,
            borderRadius: 8,
            shadowColor: palette.sky,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 2,
          }}
          onLayout={handleCanvasLayout}
          {...panResponder.panHandlers}>
          <Svg
            width={canvasWidth}
            height={canvasHeight}
            style={{ backgroundColor: palette.surface }}
            viewBox={`${-panX / zoom} ${-panY / zoom} ${canvasWidth / zoom} ${canvasHeight / zoom}`}>
            <Defs>
              <Pattern id="paperGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                <Rect width="28" height="28" fill={palette.surface} />
                <Line x1="28" y1="0" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
                <Line x1="0" y1="28" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
              </Pattern>
              <Pattern id="gridOverlay" width="28" height="28" patternUnits="userSpaceOnUse">
                <Line x1="28" y1="0" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
                <Line x1="0" y1="28" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
              </Pattern>
            </Defs>
            <Rect
              x={-canvasWidth * 2}
              y={-canvasHeight * 2}
              width={canvasWidth * 5}
              height={canvasHeight * 5}
              fill="url(#paperGrid)"
            />

            {paths.map((drawingPath, index) => (
              <Path
                key={index}
                d={drawingPath.path}
                stroke={drawingPath.color}
                strokeWidth={drawingPath.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {importedTextLines.map((line, index) => (
              <SvgText
                key={`${line.y}-${index}`}
                x={line.x}
                y={line.y}
                fill={palette.ink}
                fontSize={textToSvgService.getFontSize()}
                fontWeight="500">
                {line.text}
              </SvgText>
            ))}

            {currentPath && (
              <Path
                d={currentPath}
                stroke={selectedTool === 'eraser' ? palette.surface : selectedColor}
                strokeWidth={selectedTool === 'eraser' ? strokeWidth * 3 : strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}

            <Rect
              x={-canvasWidth * 2}
              y={-canvasHeight * 2}
              width={canvasWidth * 5}
              height={canvasHeight * 5}
              fill="url(#gridOverlay)"
              opacity={0.85}
            />
          </Svg>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  moreMenu: {
    elevation: 12,
    position: 'absolute',
    right: -73,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    top: 54,
    width: 190,
  },
  toolOptionsMenu: {
    elevation: 12,
    left: '50%',
    position: 'absolute',
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    top: 54,
  },
  transcriptionInput: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    minHeight: 120,
    padding: 12,
  },
});
