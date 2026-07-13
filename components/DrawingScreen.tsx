import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  Platform,
} from 'react-native';
import Svg, { Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { databaseService } from '../services/DatabaseService';
import { getJournalType, JournalTypeId } from '../services/JournalTypes';
import { LocalVectorizationService } from '../services/LocalVectorizationService';
import {
  MAX_TRACE_OUTPUT_BYTES,
  MAX_TRACE_PATHS,
  type CompletedVectorizationResponse,
  LocalTraceError,
  type TraceSettings,
} from '../services/LocalVectorization.types';
import { decodeImageToMask } from '../services/ImageMask';
import { drawingLog, uiLog, vectorizationLog } from '../services/Logger';
import { Palette, useTheme } from './theme';

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
  fillColor?: string;
  fillRule?: 'evenodd' | 'nonzero';
  transform?: string;
}

interface PersistedDrawing {
  paths: DrawingPath[];
}

const strokeWidths = [1, 3, 6, 10];
const defaultTraceSettings: TraceSettings = {
  threshold: 180,
  sensitivity: 50,
  speckleMinArea: 8,
  turnPolicy: 'minority',
  cornerThreshold: 0.2,
  optimizeCurve: true,
  maxPathCount: MAX_TRACE_PATHS,
  maxOutputBytes: MAX_TRACE_OUTPUT_BYTES,
};

const isDrawingPath = (value: unknown): value is DrawingPath => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.color === 'string' &&
    typeof candidate.strokeWidth === 'number' &&
    (candidate.fillColor === undefined || typeof candidate.fillColor === 'string') &&
    (candidate.fillRule === undefined ||
      candidate.fillRule === 'evenodd' ||
      candidate.fillRule === 'nonzero') &&
    (candidate.transform === undefined || typeof candidate.transform === 'string')
  );
};

const normalizePersistedDrawing = (value: unknown): PersistedDrawing => {
  if (Array.isArray(value)) {
    return {
      paths: value.filter(isDrawingPath),
    };
  }

  if (typeof value !== 'object' || value === null) {
    return { paths: [] };
  }

  const candidate = value as Record<string, unknown>;
  return {
    paths: Array.isArray(candidate.paths) ? candidate.paths.filter(isDrawingPath) : [],
  };
};

const fitViewBoxToCanvas = (
  viewBox: readonly [number, number, number, number],
  canvasWidth: number,
  canvasHeight: number
): string | undefined => {
  const [x, y, width, height] = viewBox;
  if (width <= 0 || height <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return undefined;
  }

  const scale = Math.min(canvasWidth / width, canvasHeight / height);
  const offsetX = (canvasWidth - width * scale) / 2 - x * scale;
  const offsetY = (canvasHeight - height * scale) / 2 - y * scale;
  return `matrix(${scale} 0 0 ${scale} ${offsetX} ${offsetY})`;
};

const drawingPathsFromVectorization = (
  response: CompletedVectorizationResponse,
  color: string,
  canvasWidth: number,
  canvasHeight: number
): DrawingPath[] => {
  const transform = fitViewBoxToCanvas(response.viewBox, canvasWidth, canvasHeight);
  return response.paths.map((record) => ({
    path: record.path,
    color,
    strokeWidth: 0,
    fillColor: color,
    fillRule: record.fillRule,
    transform,
  }));
};

export const DrawingScreen: React.FC<DrawingScreenProps> = ({ date, journalType, onBack }) => {
  const { drawingColors, palette } = useTheme();
  const styles = createStyles(palette);
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState(drawingColors[0]);
  const [selectedTool, setSelectedTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [activeToolOptions, setActiveToolOptions] = useState<'pen' | 'eraser' | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

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
      .then((savedDrawing) => {
        if (!cancelled) {
          const normalizedDrawing = normalizePersistedDrawing(savedDrawing);
          setPaths(normalizedDrawing.paths);
          drawingLog.debug('Drawing loaded', {
            date,
            pathCount: normalizedDrawing.paths.length,
          });
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
    vectorizationLog.info('Vectorize image pressed');
    setIsMoreMenuOpen(false);
    void importAndVectorizeImage();
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

  const importAndVectorizeImage = async () => {
    if (isVectorizing) {
      vectorizationLog.warn('Vectorization request ignored because one is already running');
      return;
    }

    vectorizationLog.info('Starting image picker');
    drawingLog.info('Starting image vectorization', { date, platform: Platform.OS });
    setIsVectorizing(true);
    try {
      if (Platform.OS !== 'web') {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(
            'Permission required',
            'Photo library permission is required to import images.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
        base64: true,
      });

      if (result.canceled) {
        drawingLog.info('Image picker canceled', { date });
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        throw new Error('No image was returned by the image picker.');
      }
      drawingLog.info('Image selected for vectorization', {
        date,
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      vectorizationLog.info('Image selected', {
        width: asset.width,
        height: asset.height,
        hasBase64: Boolean(asset.base64),
      });
      let base64 = asset.base64;
      if (!base64 && Platform.OS === 'web') {
        const imageResponse = await fetch(asset.uri);
        if (!imageResponse.ok) {
          throw new Error(`Image download failed with status ${imageResponse.status}.`);
        }
        const blob = await imageResponse.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const value = reader.result;
            if (typeof value !== 'string') {
              reject(new Error('Image data could not be read.'));
              return;
            }
            const separator = value.indexOf(',');
            resolve(separator >= 0 ? value.slice(separator + 1) : value);
          };
          reader.onerror = () => reject(new Error('Image data could not be read.'));
          reader.readAsDataURL(blob);
        });
      }
      if (!base64) {
        drawingLog.error('Selected image is missing base64 content', { date, uri: asset.uri });
        throw new Error('The selected image could not be read for vectorization.');
      }

      const request = await decodeImageToMask(base64, defaultTraceSettings, asset.mimeType);
      vectorizationLog.info('Binary mask ready', {
        width: request.width,
        height: request.height,
        bytes: request.pixels.byteLength,
      });
      const response = await LocalVectorizationService.traceMask({
        ...request,
        settings: defaultTraceSettings,
      });
      vectorizationLog.info('WASM trace completed', {
        kind: response.kind,
        pathCount: response.kind === 'completed' ? response.paths.length : 0,
      });

      if (response.kind !== 'completed') {
        Alert.alert('Vectorization unavailable', 'Local vectorization is not available yet.');
        return;
      }

      const tracedPaths = drawingPathsFromVectorization(
        response,
        selectedColor,
        canvasWidthRef.current,
        canvasHeightRef.current
      );
      const newPaths = [...paths, ...tracedPaths];
      setPaths(newPaths);
      await saveDrawing(newPaths);
      drawingLog.info('Imported image vectorized successfully', {
        date,
        pathCount: tracedPaths.length,
        width: request.width,
        height: request.height,
      });
    } catch (error) {
      drawingLog.error('Image vectorization failed', { date, error });
      const message =
        error instanceof LocalTraceError && error.code === 'TRACE_RESOURCE_LIMIT'
          ? 'The selected image is too large to vectorize on this device.'
          : error instanceof Error
            ? error.message
            : 'The selected image could not be vectorized.';
      Alert.alert('Vectorization failed', message);
    } finally {
      setIsVectorizing(false);
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
  const toolOptionsPanelWidth = Math.max(
    220,
    Math.min(width - 32, activeToolOptions === 'pen' ? 430 : 320)
  );

  return (
    <View className="flex-1" style={{ backgroundColor: palette.background }}>
      <View
        className="border-b px-4 py-3"
        style={{ backgroundColor: palette.paper, borderBottomColor: palette.border, zIndex: 10 }}>
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center pr-2">
            <TouchableOpacity
              onPress={onBack}
              className="mr-3 h-11 w-11 items-center justify-center rounded-lg"
              style={{ backgroundColor: palette.tealSoft }}>
              <Ionicons name="arrow-back" size={23} color={palette.teal} />
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

          <View
            className="flex-row rounded-lg p-1"
            style={{ backgroundColor: palette.background, position: 'relative' }}>
            <TouchableOpacity
              onPress={() => handleToolSelect('pen')}
              className="mr-1 h-11 w-11 items-center justify-center rounded-lg"
              style={{ backgroundColor: selectedTool === 'pen' ? palette.teal : 'transparent' }}>
              <Ionicons
                name="pencil-outline"
                size={22}
                color={selectedTool === 'pen' ? palette.surface : palette.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleToolSelect('eraser')}
              className="mr-1 h-11 w-11 items-center justify-center rounded-lg"
              style={{ backgroundColor: selectedTool === 'eraser' ? palette.teal : 'transparent' }}>
              <Ionicons
                name="remove-circle-outline"
                size={22}
                color={selectedTool === 'eraser' ? palette.surface : palette.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMoreToggle}
              className="h-11 w-11 items-center justify-center rounded-lg"
              style={{ backgroundColor: isMoreMenuOpen ? palette.tealSoft : 'transparent' }}>
              <Ionicons name="ellipsis-horizontal" size={23} color={palette.muted} />
            </TouchableOpacity>

            {isMoreMenuOpen && (
              <View
                className="border p-2"
                style={[
                  styles.moreMenu,
                  { backgroundColor: palette.paper, borderColor: palette.border },
                ]}>
                <TouchableOpacity
                  onPress={handleCameraAction}
                  onPressIn={() => vectorizationLog.info('Vectorize menu item pressed')}
                  disabled={isVectorizing}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="camera-outline" size={20} color={palette.teal} />
                  <Text className="ml-3 text-sm font-bold text-ink">
                    {isVectorizing ? 'Processing image...' : 'Camera'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleResetZoomAction}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="contract-outline" size={20} color={palette.teal} />
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
                className="border p-3"
                style={[
                  styles.toolOptionsMenu,
                  {
                    backgroundColor: palette.paper,
                    borderColor: palette.border,
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
                        className="mb-2 mr-2 h-9 w-9 items-center justify-center rounded-full border-2"
                        style={{
                          backgroundColor: color,
                          borderColor: selectedColor === color ? palette.ink : palette.border,
                        }}>
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
                      className="mr-2 h-11 w-11 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor:
                          strokeWidth === strokeOption ? palette.tealSoft : palette.background,
                      }}>
                      <View
                        className="rounded-full"
                        style={{
                          backgroundColor: palette.ink,
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

      <View className="flex-1 p-4" style={{ backgroundColor: palette.background }}>
        <View
          className="overflow-hidden border"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            flex: 1,
            borderRadius: 8,
            ...Platform.select({
              web: {
                boxShadow: `0px 8px 16px ${palette.teal}14`,
              },
              default: {
                shadowColor: palette.teal,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
                elevation: 2,
              },
            }),
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
                stroke={drawingPath.fillColor ? 'none' : drawingPath.color}
                strokeWidth={drawingPath.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={drawingPath.fillColor ?? 'none'}
                fillRule={drawingPath.fillRule}
                transform={drawingPath.transform}
                vectorEffect="non-scaling-stroke"
              />
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

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    moreMenu: {
      position: 'absolute',
      right: -73,
      top: 54,
      width: 190,
      ...Platform.select({
        web: {
          boxShadow: `0px 8px 18px ${palette.ink}24`,
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
    toolOptionsMenu: {
      left: '50%',
      position: 'absolute',
      top: 54,
      ...Platform.select({
        web: {
          boxShadow: `0px 8px 18px ${palette.ink}24`,
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
  });
