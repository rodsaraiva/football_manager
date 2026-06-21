// Stub leve de react-native-reanimated p/ o projeto jsdom (ts-jest type-checka a source
// real, que não compila fora do Metro). Replica só a superfície de API que o kit/overlay
// usam: Animated.View, shared values, animated style, withTiming/withRepeat, Easing.
const React = require('react');
const { View } = require('react-native-web');

const AnimatedView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));

module.exports = {
  __esModule: true,
  default: { View: AnimatedView, createAnimatedComponent: (c) => c },
  View: AnimatedView,
  useSharedValue: (v) => ({ value: v }),
  useAnimatedStyle: (fn) => fn(),
  withTiming: (v) => v,
  withRepeat: (v) => v,
  Easing: {
    bezier: () => () => 0,
    inOut: (e) => e,
    ease: () => 0,
  },
};
