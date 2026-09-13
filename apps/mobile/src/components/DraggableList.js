import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, View } from "react-native";

// Press-and-drag reordering built only on core RN APIs (PanResponder +
// Animated) — no react-native-gesture-handler / reanimated, so no native
// rebuild is needed to ship this.
//
// Each row measures its own height on layout. While dragging, only the
// dragged row visually lifts and follows the finger (translateY); siblings
// stay put until you release, at which point the final vertical offset is
// used to figure out the drop index and the list re-renders in its new
// order. `onReorder` is called with the item ids in their new order.
export default function DraggableList({ items, keyExtractor, renderItem, onReorder }) {
  const [order, setOrder] = useState(items);
  const [dragId, setDragId] = useState(null);
  const orderRef = useRef(order);
  const heightsRef = useRef({});
  const dragY = useRef(new Animated.Value(0)).current;
  const respondersRef = useRef({});

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useEffect(() => {
    if (!dragId) setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function offsetOfIndex(index) {
    let total = 0;
    for (let i = 0; i < index; i += 1) {
      total += heightsRef.current[keyExtractor(orderRef.current[i])] || 0;
    }
    return total;
  }

  function indexFromOffset(offset) {
    let acc = 0;
    const list = orderRef.current;
    for (let i = 0; i < list.length; i += 1) {
      const h = heightsRef.current[keyExtractor(list[i])] || 0;
      if (offset < acc + h / 2) return i;
      acc += h;
    }
    return list.length - 1;
  }

  function getResponder(id) {
    if (respondersRef.current[id]) return respondersRef.current[id];
    let startIndex = 0;
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startIndex = orderRef.current.findIndex((it) => keyExtractor(it) === id);
        setDragId(id);
        dragY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: dragY }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, gesture) => {
        const from = startIndex;
        const to = Math.max(0, Math.min(orderRef.current.length - 1, indexFromOffset(offsetOfIndex(from) + gesture.dy)));
        Animated.timing(dragY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
        setDragId(null);
        if (to !== from) {
          const next = [...orderRef.current];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          setOrder(next);
          onReorder(next.map(keyExtractor));
        }
      },
      onPanResponderTerminate: () => {
        Animated.timing(dragY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
        setDragId(null);
      },
    });
    respondersRef.current[id] = responder;
    return responder;
  }

  return (
    <View>
      {order.map((item) => {
        const id = keyExtractor(item);
        const isDragging = dragId === id;
        const responder = getResponder(id);
        return (
          <Animated.View
            key={id}
            onLayout={(e) => {
              heightsRef.current[id] = e.nativeEvent.layout.height;
            }}
            style={isDragging ? { transform: [{ translateY: dragY }], zIndex: 10, elevation: 8 } : null}
          >
            {renderItem({ item, isDragging, dragHandleProps: responder.panHandlers })}
          </Animated.View>
        );
      })}
    </View>
  );
}
