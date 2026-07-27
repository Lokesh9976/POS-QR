import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { API_URL } from "../../constants/Config";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { useCartStore } from "../../stores/cartStore";
import { useCompanySettingsStore } from "../../stores/companySettingsStore";
import { Ionicons } from "@expo/vector-icons";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          "#F8F9FA",      // soft light background
  surface:     "#FFFFFF",      // card surface
  surfaceHigh: "#F1F5F9",      // elevated input surface
  border:      "#E2E8F0",      // subtle border
  gold:        "#FF5E1A",      // Wagba vibrant orange
  goldDim:     "#E04D10",      // darker orange for pressed states
  goldSoft:    "rgba(255, 94, 26, 0.08)", // faint orange tint
  white:       "#0F172A",      // text primary
  muted:       "#64748B",      // text secondary
  error:       "#EF4444",      // error red
  errorBg:     "rgba(239, 68, 68, 0.08)",
  errorBorder: "rgba(239, 68, 68, 0.2)",
  success:     "#10B981",
};

export default function CustomerWelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const settings = useCompanySettingsStore((s: any) => s.settings);

  const [scannedTable, setScannedTable] = useState<{
    tableId: string;
    tableNo: string;
    section: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Sign In
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up
  const [regUsername, setRegUsername] = useState("");
  const [regCountryCode, setRegCountryCode] = useState("+65");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regPromoCode, setRegPromoCode] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [popupConfig, setPopupConfig] = useState<{ title: string; message: string } | null>(null);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [foodIndex, setFoodIndex] = useState(0);

  // Spin animation for full screen transition
  const spinValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  const foodEmojis = ["🍕", "🍔", "🌮", "🍜", "🍰", "☕"];

  useEffect(() => {
    let interval: any;
    if (transitioning) {
      // Fast cycling of food emojis
      interval = setInterval(() => {
        setFoodIndex((prev) => (prev + 1) % foodEmojis.length);
      }, 150);

      // Spin rotation loop
      spinValue.setValue(0);
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();

      // Bouncing pulse animation loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleValue, { toValue: 1.25, duration: 250, useNativeDriver: true }),
          Animated.timing(scaleValue, { toValue: 0.85, duration: 250, useNativeDriver: true }),
        ])
      ).start();
    } else {
      setFoodIndex(0);
      scaleValue.setValue(1);
    }
    return () => clearInterval(interval);
  }, [transitioning]);

  const spinRotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Animations
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const tabAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    useCompanySettingsStore.getState().fetchSettings?.();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (scannedTable) return;
    const { tableId, tableNo, section } = params;
    if (tableId && tableNo) {
      const scanned = {
        tableId: String(tableId),
        tableNo: String(tableNo),
        section: section ? String(section) : "SECTION_1",
      };
      setScannedTable(scanned);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("tableId", String(tableId));
        localStorage.setItem("tableNo", String(tableNo));
        localStorage.setItem("section", section ? String(section) : "SECTION_1");
      }
    } else {
      if (typeof localStorage !== "undefined") {
        const storedTableId = localStorage.getItem("tableId");
        const storedTableNo = localStorage.getItem("tableNo");
        const storedSection = localStorage.getItem("section") || "SECTION_1";
        if (storedTableId && storedTableNo) {
          setScannedTable({
            tableId: storedTableId,
            tableNo: storedTableNo,
            section: storedSection,
          });
          return;
        }
      }
      // Default fallback for development/testing
      setScannedTable({
        tableId: "1",
        tableNo: "1",
        section: "SECTION_1",
      });
    }
  }, [params, scannedTable]);

  const selectCountryCode = () => {
    setShowPicker(true);
  };

  const showPopup = (title: string, message: string) => {
    setPopupConfig({ title, message });
  };

  const switchTab = (tab: "signin" | "signup") => {
    setActiveTab(tab);
    setAuthError("");
    Animated.timing(tabAnim, {
      toValue: tab === "signin" ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  const proceedToMenu = (user: { userName: string; fullName?: string; phone?: string; email?: string; promoCode?: string; promoAmount?: number }) => {
    if (!scannedTable) {
      Alert.alert("No Table", "Please scan a table QR code first.");
      return;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("qr_pos_user", JSON.stringify({
        UserName: user.userName,
        FullName: user.fullName || user.userName,
        Phone: user.phone || "",
        Email: user.email || "",
        PromoCode: user.promoCode || "",
        PromoAmount: user.promoAmount || 0,
      }));
    }
    useOrderContextStore.getState().setOrderContext({
      orderType: "DINE_IN",
      tableId: scannedTable.tableId,
      tableNo: scannedTable.tableNo,
      section: scannedTable.section,
    });
    const contextId = `DINE_IN_${scannedTable.section}_${scannedTable.tableNo}`;
    useCartStore.getState().setCurrentContext(contextId);
    useCartStore.getState().fetchCartFromDB(scannedTable.tableId);
    router.replace("/customer/menu" as any);
  };

  const handleSignIn = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      showPopup("Error", "Please enter your name and password.");
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: loginUsername.trim(), password: loginPassword.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTransitioning(true);
        setTimeout(() => {
          proceedToMenu({
            userName: data.user.userName,
            phone: data.user.phone,
            email: data.user.email,
            promoCode: data.user.Promocode,
            promoAmount: data.user.Promoamount,
          });
          setTransitioning(false);
        }, 1000);
      } else {
        showPopup("Sign In Failed", data.message || "Invalid name or password.");
      }
    } catch {
      showPopup("Error", "Cannot connect to server. Please check your connection.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!regUsername.trim() || !regPhone.trim() || !regPassword.trim()) {
      showPopup("Error", "Please fill out all fields.");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      showPopup("Error", "Passwords do not match.");
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: regUsername.trim(),
          mobileNumber: regCountryCode + regPhone.trim(),
          email: regEmail.trim(),
          password: regPassword.trim(),
          promoCode: regPromoCode.trim()
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTransitioning(true);
        setTimeout(() => {
          proceedToMenu({ userName: regUsername.trim(), phone: regCountryCode + regPhone.trim(), email: regEmail.trim() });
          setTransitioning(false);
        }, 1000);
      } else {
        showPopup("Registration Failed", data.message || "Registration failed. Please try again.");
      }
    } catch {
      showPopup("Error", "Cannot connect to server. Please check your connection.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuest = () => {
    setTransitioning(true);
    setTimeout(() => {
      proceedToMenu({ userName: "Guest", fullName: "Guest Customer" });
      setTransitioning(false);
    }, 1000);
  };

  const getLogoUri = (logo?: string) => {
    if (!logo) return undefined;
    if (logo.startsWith('data:image')) return logo;
    if (logo.startsWith('http')) return logo;
    return `${API_URL}${logo.startsWith('/') ? '' : '/'}${logo}`;
  };

  const logoUri = getLogoUri(settings?.companyLogo);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Background decorative glows */}
      <View style={styles.glowTopRight} />
      <View style={styles.glowBottomLeft} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* ── Logo ── */}
          <View style={styles.logoSection}>
            <View style={styles.logoBadge}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={{ width: "100%", height: "100%", borderRadius: 18, resizeMode: "cover" }} />
              ) : (
                <Ionicons name="restaurant" size={30} color={C.gold} />
              )}
            </View>
            <Text style={styles.appTitle}>{settings?.name || "Wagba"}</Text>
            <Text style={styles.appSubtitle}>Restaurant Ordering System</Text>
            {scannedTable && (
              <View style={styles.tablePill}>
                <Ionicons name="location-sharp" size={12} color={C.gold} />
                <Text style={styles.tablePillText}>Table {scannedTable.tableNo}</Text>
              </View>
            )}
          </View>

          {/* ── Segmented Tabs ── */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.tabBtn, activeTab === "signin" && styles.tabBtnActive]}
              onPress={() => switchTab("signin")}
            >
              <Text style={[styles.tabText, activeTab === "signin" && styles.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.tabBtn, activeTab === "signup" && styles.tabBtnActive]}
              onPress={() => switchTab("signup")}
            >
              <Text style={[styles.tabText, activeTab === "signup" && styles.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>



          {/* ═══════════════ SIGN IN ═══════════════ */}
          {activeTab === "signin" && (
            <View style={styles.form}>
              <DarkField
                icon="person-outline"
                label="USER NAME"
                placeholder="Enter your name"
                value={loginUsername}
                onChangeText={setLoginUsername}
                autoCapitalize="none"
              />
              <DarkField
                icon="lock-closed-outline"
                label="PASSWORD"
                placeholder="Enter your password"
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry={!showLoginPassword}
                rightIcon={showLoginPassword ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowLoginPassword(!showLoginPassword)}
              />

              <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={handleSignIn} disabled={authLoading}>
                {authLoading
                  ? <ActivityIndicator color={C.bg} />
                  : <Text style={styles.primaryBtnText}>Sign In</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════ SIGN UP ═══════════════ */}
          {activeTab === "signup" && (
            <View style={styles.form}>
              <DarkField icon="person-outline" label="USER NAME" placeholder="Enter your name" value={regUsername} onChangeText={setRegUsername} autoCapitalize="none" />
              
              {/* Phone Field with Country Code Selection */}
              <View style={fieldStyles.field}>
                <Text style={fieldStyles.label}>PHONE NUMBER *</Text>
                <View style={[fieldStyles.inputWrap, { alignItems: 'center' }]}>
                  <Ionicons name="call-outline" size={18} color={C.muted} style={fieldStyles.icon} />
                  <TouchableOpacity 
                    onPress={selectCountryCode} 
                    style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      paddingRight: 8, 
                      borderRightWidth: 1, 
                      borderRightColor: C.border || '#e2e8f0', 
                      marginRight: 8,
                      height: '100%',
                      justifyContent: 'center'
                    }}
                  >
                    <Text style={{ color: '#000', fontSize: 14, fontWeight: '500' }}>
                      {regCountryCode} ▾
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[fieldStyles.input, { flex: 1 }]}
                    placeholder="Enter phone number"
                    placeholderTextColor={C.muted}
                    value={regPhone}
                    onChangeText={(t) => setRegPhone(t.replace(/[^0-9]/g, ''))}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <DarkField icon="mail-outline" label="EMAIL ID" placeholder="Enter email address (optional)" value={regEmail} onChangeText={setRegEmail} autoCapitalize="none" keyboardType="email-address" />
              <DarkField
                icon="lock-closed-outline" label="PASSWORD *" placeholder="Create a password"
                value={regPassword} onChangeText={setRegPassword}
                secureTextEntry={!showRegPassword}
                rightIcon={showRegPassword ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowRegPassword(!showRegPassword)}
              />
              <DarkField
                icon="shield-checkmark-outline" label="CONFIRM PASSWORD *" placeholder="Re-enter password"
                value={regConfirmPassword} onChangeText={setRegConfirmPassword}
                secureTextEntry={!showRegConfirmPassword}
                rightIcon={showRegConfirmPassword ? "eye-off-outline" : "eye-outline"}
                onRightIconPress={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
              />
              <DarkField icon="pricetag-outline" label="PROMO CODE" placeholder="Optional promo code" value={regPromoCode} onChangeText={setRegPromoCode} autoCapitalize="characters" />

              <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={handleSignUp} disabled={authLoading}>
                {authLoading
                  ? <ActivityIndicator color={C.bg} />
                  : <Text style={styles.primaryBtnText}>Create Account</Text>}
              </TouchableOpacity>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => switchTab("signin")}>
                  <Text style={styles.footerLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Divider + Guest option ── */}
          {activeTab === "signin" && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
          )}
          {activeTab === "signin" && (
            <TouchableOpacity activeOpacity={0.8} style={styles.guestBtn} onPress={handleGuest}>
              <Ionicons name="person-circle-outline" size={18} color={C.gold} />
              <Text style={styles.guestBtnText}>Continue as Guest</Text>
            </TouchableOpacity>
          )}

         </Animated.View>
       </ScrollView>

       {showPicker && (
         <Modal transparent visible={showPicker} animationType="fade">
           <TouchableOpacity 
             style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} 
             activeOpacity={1}
             onPress={() => setShowPicker(false)}
           >
             <View style={{ width: 280, backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}>
               <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#1e293b' }}>Select Country Code</Text>
                {[
                  { label: "Singapore (+65)", value: "+65" },
                  { label: "Malaysia (+60)", value: "+60" },
                  { label: "India (+91)", value: "+91" },
                  { label: "Indonesia (+62)", value: "+62" },
                  { label: "USA (+1)", value: "+1" }
                ].map((item) => (
                  <TouchableOpacity 
                    key={item.value} 
                    style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                    onPress={() => {
                      setRegCountryCode(item.value);
                      setShowPicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#334155' }}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
               <TouchableOpacity 
                 style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8 }}
                 onPress={() => setShowPicker(false)}
               >
                 <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748b' }}>Cancel</Text>
               </TouchableOpacity>
             </View>
           </TouchableOpacity>
         </Modal>
       )}

        {popupConfig && (
          <Modal transparent visible={!!popupConfig} animationType="fade">
            <TouchableOpacity 
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }} 
              activeOpacity={1}
              onPress={() => setPopupConfig(null)}
            >
              <View style={{ width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="alert-circle" size={32} color="#ef4444" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 8, textAlign: 'center' }}>{popupConfig.title}</Text>
                <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>{popupConfig.message}</Text>
                <TouchableOpacity 
                  style={{ width: '100%', paddingVertical: 12, alignItems: 'center', backgroundColor: C.gold || '#FF5E1A', borderRadius: 12 }}
                  onPress={() => setPopupConfig(null)}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>OK</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {transitioning && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", zIndex: 99999 }]}>
            <View style={{ justifyContent: "center", alignItems: "center" }}>
              <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
                <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 4, borderColor: "#FF5E1A", borderTopColor: "transparent", borderRightColor: "transparent" }} />
              </Animated.View>
              <View style={{ position: "absolute", width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFF2EC", justifyContent: "center", alignItems: "center" }}>
                <Animated.Text style={{ fontSize: 26, transform: [{ scale: scaleValue }] }}>
                  {foodEmojis[foodIndex]}
                </Animated.Text>
              </View>
            </View>
            <Text style={{ marginTop: 28, fontSize: 18, fontWeight: "700", color: "#0F172A", letterSpacing: 0.5 }}>
              Entering Restaurant...
            </Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: "#64748B" }}>
              Setting up your digital menu
            </Text>
          </View>
        )}
    </KeyboardAvoidingView>
  );
}



interface DarkFieldProps {
  icon: any;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  rightIcon?: any;
  onRightIconPress?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: any;
}

function DarkField({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  rightIcon,
  onRightIconPress,
  autoCapitalize,
  keyboardType,
}: DarkFieldProps) {
  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.inputWrap}>
        <Ionicons name={icon} size={18} color={C.muted} style={fieldStyles.icon} />
        <TextInput
          style={fieldStyles.input}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={fieldStyles.eye}>
            <Ionicons name={rightIcon} size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  field:     { gap: 6 },
  label:     { fontSize: 11, fontWeight: "700", color: C.muted, letterSpacing: 0.5 },
  inputWrap: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  icon:   { marginRight: 8 },
  input:  { flex: 1, fontSize: 14, fontWeight: "500", color: C.white, height: "100%" },
  eye:    { padding: 6 },
});

// ─── Main StyleSheet ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 16 },

  // Decorative background glows
  glowTopRight: {
    position: "absolute", top: 0, right: 0,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: "rgba(255, 94, 26, 0.04)",
  },
  glowBottomLeft: {
    position: "absolute", bottom: 0, left: 0,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: "rgba(255, 94, 26, 0.03)",
  },

  // Card
  card: {
    width: "100%", maxWidth: 420,
    backgroundColor: C.surface,
    borderRadius: 28,
    paddingVertical: 36, paddingHorizontal: 24,
    borderWidth: 1, borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.05,
    shadowRadius: 32,
    elevation: 8,
  },

  // Logo section
  logoSection: { alignItems: "center", marginBottom: 28 },
  logoBadge: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: C.goldSoft,
    borderWidth: 1.5, borderColor: C.gold,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  appTitle:    { fontSize: 22, fontWeight: "900", color: C.white, letterSpacing: 0.5 },
  appSubtitle: { fontSize: 12, color: C.muted, marginTop: 3, fontWeight: "500" },
  tablePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.goldSoft,
    borderWidth: 1, borderColor: C.gold,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, marginTop: 12,
  },
  tablePillText: { fontSize: 12, fontWeight: "700", color: C.gold },

  // Tab switcher
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.surfaceHigh,
    borderRadius: 14, padding: 4,
    marginBottom: 24,
    borderWidth: 1, borderColor: C.border,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: 10, alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: C.gold,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8,
  },
  tabText:       { fontSize: 14, fontWeight: "700", color: C.muted },
  tabTextActive: { color: "#FFFFFF" },

  // Error
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.errorBg,
    borderWidth: 1, borderColor: C.errorBorder,
    borderRadius: 12, padding: 10, marginBottom: 16,
  },
  errorText: { fontSize: 12, color: C.error, fontWeight: "600", flex: 1 },

  // Form
  form: { gap: 14 },

  // Primary button
  primaryBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: C.gold,
    alignItems: "center", justifyContent: "center",
    marginTop: 8,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14,
    elevation: 5,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },

  // Footer links
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 14 },
  footerText: { fontSize: 13, color: C.muted, fontWeight: "500" },
  footerLink: { fontSize: 13, fontWeight: "800", color: C.gold, textDecorationLine: "underline" },

  // Divider
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, color: C.muted, fontWeight: "600" },

  // Guest button
  guestBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 50, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.gold,
    backgroundColor: C.goldSoft,
  },
  guestBtnText: { fontSize: 14, fontWeight: "700", color: C.gold },
});
