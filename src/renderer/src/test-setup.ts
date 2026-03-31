import '@testing-library/jest-dom';

global.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// jsdom doesn't support Element.getAnimations() used by @base-ui/react ScrollArea
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
