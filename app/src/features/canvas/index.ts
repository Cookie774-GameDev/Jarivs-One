export { CanvasPage } from './CanvasPage';
export { CanvasOutline, blockOutlineLabel, type CanvasOutlineProps } from './CanvasOutline';
export * from './assets';
export * from './autosave';
export * from './camera';
export * from './clipboard';
export {
  CANVAS_CONNECTOR_ANCHORS,
  CANVAS_CONNECTOR_ARROWS,
  CANVAS_CONNECTOR_OBSTACLE_MARGIN,
  CANVAS_CONNECTOR_STYLES,
  CANVAS_MAX_CONNECTOR_LABEL_LENGTH,
  assertUniqueConnectorIds,
  connectorById,
  connectorSelectionId,
  connectorSelectionIds,
  createCanvasConnector,
  createConnectorCollection,
  isCanvasConnectorAnchor,
  isCanvasConnectorArrow,
  isCanvasConnectorStyle,
  isConnectorSelected,
  parseCanvasConnector,
  parseCanvasConnectorId,
  resolveAnchorPoint,
  resolveConnectorEndpoints,
  resolveConnectorEndpointsFromDocument,
  resolveConnectorRoute,
  resolveConnectorRouteFromDocument,
  validateConnectorReferences,
  withConnectorAdded,
  withConnectorRemoved,
  withConnectorUpdated,
  type CanvasConnector,
  type CanvasConnectorAnchor,
  type CanvasConnectorArrow,
  type CanvasConnectorChanges,
  type CanvasConnectorEndpoint,
  type CanvasConnectorEndpointInput,
  type CanvasConnectorId,
  type CanvasConnectorResolvedEndpoints,
  type CanvasConnectorRoute,
  type CanvasConnectorRouteOptions,
  type CanvasConnectorStyle,
  type CanvasPoint as CanvasConnectorPoint,
  type CreateCanvasConnectorInput,
} from './connectors';
export * from './contracts';
export {
  addFrameChild,
  createFrame,
  frameExportDescriptor,
  moveFrame as moveCanvasFrame,
  presentationOrderedFrames,
  referenceFrame,
  removeFrameChild,
  renameFrame,
  resizeFrameToContent,
  setFrameBackground,
  setFrameCollapsed,
  setFrameLocked,
  validateContainmentGraph,
  withFrameExport,
  type CanvasContainmentResult,
  type CanvasFrame,
  type CanvasFrameBackground,
  type CanvasFrameDelta,
  type CanvasFrameExportDescriptor,
  type CanvasFrameMutationResult,
  type CanvasFrameOperation,
  type CanvasFrameReference,
  type CanvasFrameResizeOptions,
  type CreateCanvasFrameInput,
} from './frames';
export * from './geometry';
export * from './groups';
export * from './history';
export * from './media';
export * from './markdown';
export * from './packageFormat';
export * from './paint';
export * from './persistence';
export * from './presentation';
export * from './search';
export * from './selection';
export * from './shapes';
export * from './spatialIndex';
export * from './strokes';
export * from './surfaces';
