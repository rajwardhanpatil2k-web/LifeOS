import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useDispatch } from "react-redux";
import { login } from "../authSlice";
import { getApiUrl, saveApiUrl } from "../apiConfig";
import { testApiConnection } from "../api";
import { DARK_COLORS as colors } from "../theme";

export default function LoginScreen() {
  const dispatch = useDispatch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(getApiUrl());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setServerUrl(getApiUrl());
  }, []);

  async function submit() {
    if (busy) return;
    setError("");
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      await testApiConnection(serverUrl);
      await saveApiUrl(serverUrl);
      await dispatch(login({ username: username.trim(), password })).unwrap();
      setPassword("");
    } catch (err) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Life OS</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.hint}>One account, stored on your server.</Text>
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          placeholderTextColor={colors.muted2}
          onChangeText={setUsername}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          placeholderTextColor={colors.muted2}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
        <Text style={styles.label}>Server</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://10.0.2.2:4000"
          placeholderTextColor={colors.muted2}
          onChangeText={setServerUrl}
        />
        <Pressable style={[styles.button, busy && styles.buttonOff]} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color="#1a1408" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
  },
  kicker: { color: colors.gold, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 28, fontWeight: "700", marginTop: 6 },
  hint: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 18 },
  label: { color: colors.muted2, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
  input: {
    color: colors.text,
    backgroundColor: colors.bgSoft,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 16,
  },
  button: { backgroundColor: colors.gold, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center" },
  buttonOff: { opacity: 0.7 },
  buttonText: { color: "#1a1408", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, fontSize: 13, marginTop: 12, lineHeight: 18 },
});
