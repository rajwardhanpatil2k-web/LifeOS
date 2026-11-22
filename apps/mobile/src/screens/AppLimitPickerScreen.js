import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useTheme } from "../hooks/useTheme";
import { filterApps, isSuggestedPackage } from "../appLimitMath";
import { addAppLimit, loadInstalledApps } from "../appLimitSlice";

export default function AppLimitPickerScreen({ navigation }) {
  const dispatch = useDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const apps = useSelector((s) => s.appLimits.apps);
  const appsStatus = useSelector((s) => s.appLimits.appsStatus);
  const limits = useSelector((s) => s.appLimits.limits);
  const [query, setQuery] = useState("");

  useEffect(() => {
    dispatch(loadInstalledApps());
  }, [dispatch]);

  const shown = useMemo(() => filterApps(apps, query, limits), [apps, query, limits]);

  return (
    <View style={styles.page}>
      <Text style={styles.hint}>Pick an app. It starts at 1 hour, and you can change that on the previous screen.</Text>
      <TextInput
        style={styles.input}
        value={query}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Search apps"
        placeholderTextColor={colors.muted2}
        onChangeText={setQuery}
      />
      {appsStatus === "loading" && apps.length === 0 ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.packageName}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {appsStatus === "error" ? "Couldn't read the apps on this phone." : "No apps match that."}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                dispatch(addAppLimit({ packageName: item.packageName, label: item.label }));
                navigation.goBack();
              }}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{String(item.label || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.label}
                </Text>
                {isSuggestedPackage(item.packageName) ? <Text style={styles.suggested}>Suggested</Text> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 16 },
    hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
    },
    avatarText: { color: colors.gold, fontWeight: "700", fontSize: 15 },
    copy: { flex: 1 },
    title: { color: colors.text, fontSize: 16, fontWeight: "600" },
    suggested: { color: colors.gold, fontSize: 12, fontWeight: "700", marginTop: 2 },
    empty: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 20 },
  });
}
