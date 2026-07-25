import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Theme } from "../../constants/theme";
import { API_URL } from "../../constants/Config";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { useCartStore } from "../../stores/cartStore";
import { useCompanySettingsStore } from "../../stores/companySettingsStore";
import { Ionicons } from "@expo/vector-icons";

export default function CustomerWelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [scannedTable, setScannedTable] = useState<{
    tableId: string;
    tableNo: string;
    section: string;
  } | null>(null);

  // Active Tab: 'signin' | 'signup'
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Sign In Form State
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up Form State
  const [regUsername, setRegUsername] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regPromoCode, setRegPromoCode] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // UI Feedback
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Load live company settings from DB
    useCompanySettingsStore.getState().fetchSettings?.();

    // Start entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Parse QR Code parameters from URL
  useEffect(() => {
    const { tableId, tableNo, section } = params;
    if (tableId && tableNo) {
      const sectionName = section ? String(section) : "SECTION_1";
      setScannedTable({
        tableId: String(tableId),
        tableNo: String(tableNo),
        section: sectionName,
      });
    }
  }, [params]);

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tables/all`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const dineInTables = data.filter((t: any) => t.DiningSection !== "4");
        setTables(dineInTables);
      }
    } catch (err) {
      console.error("Error fetching tables:", err);
    } finally {
      setLoading(false);
    }
  };

  const sectionMap: Record<string, string> = {
    "1": "SECTION_1",
    "2": "SECTION_2",
    "3": "SECTION_3",
  };

  const proceedToMenu = (user: { userName: string; fullName?: string; phone?: string }) => {
    const targetTableId = scannedTable?.tableId || selectedTable?.id;
    const targetTableNo = scannedTable?.tableNo || selectedTable?.label;
    const targetSection =
      scannedTable?.section ||
      (selectedTable
        ? sectionMap[selectedTable.DiningSection] || "SECTION_1"
        : "SECTION_1");

    if (!targetTableId || !targetTableNo) {
      Alert.alert("Select Table", "Please select a table to start ordering.");
      return;
    }

    // Save user info in localStorage for display in app header
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem(
        "qr_pos_user",
        JSON.stringify({
          UserName: user.userName,
          FullName: user.fullName || user.userName,
          Phone: user.phone || "",
        })
      );
    }

    useOrderContextStore.getState().setOrderContext({
      orderType: "DINE_IN",
      tableId: String(targetTableId),
      tableNo: String(targetTableNo),
      section: String(targetSection),
    });

    const contextId = `DINE_IN_${targetSection}_${targetTableNo}`;
    useCartStore.getState().setCurrentContext(contextId);
    useCartStore.getState().fetchCartFromDB(String(targetTableId));

    router.replace("/customer/menu" as any);
  };

  // Sign In Handler
  const handleSignIn = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setAuthError("Please enter your Username and Password.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: loginUsername.trim(),
          password: loginPassword.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        proceedToMenu({
          userName: data.user?.UserName || loginUsername.trim(),
          fullName: data.user?.FullName || data.user?.UserName,
        });
      } else {
        setAuthError(data.message || "Invalid credentials. Please try again.");
      }
    } catch (err) {
      // Fallback if network offline
      proceedToMenu({
        userName: loginUsername.trim(),
        fullName: loginUsername.trim(),
      });
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign Up Handler
  const handleSignUp = async () => {
    if (!regUsername.trim()) {
      setAuthError("Please enter a username.");
      return;
    }
    if (!regPhone.trim()) {
      setAuthError("Please enter a phone number.");
      return;
    }
    if (!regPassword.trim()) {
      setAuthError("Please create a password.");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      // Register in backend database if API is available
      await fetch(`${API_URL}/api/loyalty/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: regUsername.trim(),
          mobileNumber: regPhone.trim(),
          password: regPassword.trim(),
          promoCode: regPromoCode.trim(),
        }),
      });

      proceedToMenu({
        userName: regUsername.trim(),
        fullName: regUsername.trim(),
        phone: regPhone.trim(),
      });
    } catch (err) {
      proceedToMenu({
        userName: regUsername.trim(),
        fullName: regUsername.trim(),
        phone: regPhone.trim(),
      });
    } finally {
      setAuthLoading(false);
    }
  };

  // Guest Handler
  const handleGuest = () => {
    proceedToMenu({ userName: "Guest", fullName: "Guest Customer" });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Background Decorative Particles */}
      <View style={styles.bgParticleTopRight} />
      <View style={styles.bgParticleBottomLeft} />
      <View style={styles.bgParticleCenter} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.cardContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Logo & Branding Header */}
          <View style={styles.logoSection}>
            <View style={styles.logoBadge}>
              <Ionicons name="restaurant" size={32} color="#fff" />
            </View>
            <Text style={styles.appTitle}>QR POS</Text>
            <Text style={styles.appSubtitle}>
              Restaurant Ordering System
            </Text>

            {/* Scanned Table Badge */}
            {scannedTable && (
              <View style={styles.tableBadge}>
                <Ionicons name="location-sharp" size={14} color="#FF7D1A" />
                <Text style={styles.tableBadgeText}>
                  Table {scannedTable.tableNo}
                </Text>
              </View>
            )}
          </View>

          {/* Segmented Tab Switcher (Sign In vs Sign Up) */}
          <View style={styles.segmentedContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.segmentBtn,
                activeTab === "signin" && styles.segmentBtnActive,
              ]}
              onPress={() => {
                setActiveTab("signin");
                setAuthError("");
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === "signin" && styles.segmentTextActive,
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.segmentBtn,
                activeTab === "signup" && styles.segmentBtnActive,
              ]}
              onPress={() => {
                setActiveTab("signup");
                setAuthError("");
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === "signup" && styles.segmentTextActive,
                ]}
              >
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Global Error Banner */}
          {authError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          ) : null}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* SIGN IN TAB CONTENT                                          */}
          {/* ───────────────────────────────────────────────────────────── */}
          {activeTab === "signin" && (
            <View style={styles.formContainer}>
              {/* Field 1: USERNAME */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter your username"
                    placeholderTextColor="#CBD5E1"
                    value={loginUsername}
                    onChangeText={setLoginUsername}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Field 2: PASSWORD */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter your password"
                    placeholderTextColor="#CBD5E1"
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    secureTextEntry={!showLoginPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowLoginPassword(!showLoginPassword)}
                    style={styles.eyeIconBtn}
                  >
                    <Ionicons
                      name={showLoginPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>



              {/* Primary Action Button: Sign In */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.primaryBtn}
                onPress={handleSignIn}
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {/* Footer Guest Link */}
              <View style={styles.footerLinkRow}>
                <Text style={styles.footerText}>Don't have an account? </Text>
                <TouchableOpacity onPress={handleGuest}>
                  <Text style={styles.footerLink}>Continue as Guest</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* SIGN UP TAB CONTENT                                          */}
          {/* ───────────────────────────────────────────────────────────── */}
          {activeTab === "signup" && (
            <View style={styles.formContainer}>
              {/* Field 1: USERNAME * */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Choose a username"
                    placeholderTextColor="#CBD5E1"
                    value={regUsername}
                    onChangeText={setRegUsername}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Field 2: PHONE NUMBER * */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PHONE NUMBER *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="call-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter phone number"
                    placeholderTextColor="#CBD5E1"
                    value={regPhone}
                    onChangeText={setRegPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Field 3: PASSWORD * */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Create a password"
                    placeholderTextColor="#CBD5E1"
                    value={regPassword}
                    onChangeText={setRegPassword}
                    secureTextEntry={!showRegPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowRegPassword(!showRegPassword)}
                    style={styles.eyeIconBtn}
                  >
                    <Ionicons
                      name={showRegPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Field 4: CONFIRM PASSWORD * */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CONFIRM PASSWORD *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Re-enter your password"
                    placeholderTextColor="#CBD5E1"
                    value={regConfirmPassword}
                    onChangeText={setRegConfirmPassword}
                    secureTextEntry={!showRegConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    style={styles.eyeIconBtn}
                  >
                    <Ionicons
                      name={showRegConfirmPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Field 5: PROMO CODE */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PROMO CODE</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="pricetag-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter promo code"
                    placeholderTextColor="#CBD5E1"
                    value={regPromoCode}
                    onChangeText={setRegPromoCode}
                    autoCapitalize="characters"
                  />
                </View>
              </View>



              {/* Primary Action Button: Create Account */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.primaryBtn}
                onPress={handleSignUp}
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>

              {/* Footer Sign In Link */}
              <View style={styles.footerLinkRow}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => setActiveTab("signin")}>
                  <Text style={styles.footerLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FDFBF7",
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },

  // Floating background particles
  bgParticleTopRight: {
    position: "absolute",
    top: 40,
    right: 40,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255, 125, 26, 0.25)",
  },
  bgParticleBottomLeft: {
    position: "absolute",
    bottom: 60,
    left: 30,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 125, 26, 0.2)",
  },
  bgParticleCenter: {
    position: "absolute",
    top: 80,
    left: 80,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 125, 26, 0.15)",
  },

  // Main Floating Card
  cardContainer: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    shadowColor: "#FF7D1A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },

  // Logo & Header Section
  logoSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#FF7D1A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#FF7D1A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 3,
    fontWeight: "500",
  },
  tableBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FFEDD5",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginTop: 10,
  },
  tableBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EA580C",
  },

  // Segmented Switcher (Sign In / Sign Up)
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: {
    backgroundColor: "#FF7D1A",
    shadowColor: "#FF7D1A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },

  // Global Error Box
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "600",
    flex: 1,
  },

  // Form Container & Fields
  formContainer: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#0F172A",
    height: "100%",
  },
  eyeIconBtn: {
    padding: 6,
  },

  // Table Fallback Box (when no QR is scanned)
  tableFallbackBox: {
    marginVertical: 4,
  },
  tableFallbackTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  miniTableBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },
  miniTableBtnSelected: {
    backgroundColor: "#FF7D1A",
    borderColor: "#FF7D1A",
  },
  miniTableBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  miniTableBtnTextSelected: {
    color: "#FFFFFF",
  },

  // Primary Action Button (Orange Glow)
  primaryBtn: {
    backgroundColor: "#FF7D1A",
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF7D1A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    marginTop: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  // Footer Links
  footerLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  footerText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  footerLink: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FF7D1A",
    textDecorationLine: "underline",
  },
});
