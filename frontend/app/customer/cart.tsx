import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Theme } from "../../constants/theme";
import { useCartStore } from "../../stores/cartStore";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { useCompanySettingsStore } from "../../stores/companySettingsStore";
import { API_URL } from "../../constants/Config";
import { Ionicons } from "@expo/vector-icons";

export default function CustomerCartScreen() {
  const router = useRouter();
  const { carts, currentContextId, updateCartItemQty, syncCartWithDB, checkoutOrder } = useCartStore();
  const orderContext = useOrderContextStore((state) => state.currentOrder);
  const settings = useCompanySettingsStore((state: any) => state.settings);
  
  // 🌟 Premium Micro-Animation refs & state
  const [isAnimating, setIsAnimating] = useState(false);
  const animButtonScale = useRef(new Animated.Value(1)).current;
  const animTextOpacity = useRef(new Animated.Value(1)).current;
  const animRocketScale = useRef(new Animated.Value(0)).current;
  const animRocketY = useRef(new Animated.Value(40)).current; // starts below
  const animShake = useRef(new Animated.Value(0)).current; // shakes left-right
  const animSuccessOpacity = useRef(new Animated.Value(0)).current;
  const animButtonColor = useRef(new Animated.Value(0)).current; // 0 = brand, 1 = emerald success
  const animButtonWidth = useRef(new Animated.Value(1)).current; // 1 = full width, 0 = circular capsule
  
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [applyPromo, setApplyPromo] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; amount: number; discountType?: string } | null>(null);

  React.useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("qr_pos_user");
      let userObj: any = null;
      if (stored) {
        try {
          userObj = JSON.parse(stored);
          setUserInfo(userObj);
        } catch (e) {}
      }
      const savedPromo = localStorage.getItem("promoCode");
      if (savedPromo) {
        const amount = Number(userObj?.PromoAmount ?? userObj?.Promoamount ?? userObj?.promoAmount ?? 0);
        setAppliedPromo({ code: savedPromo, amount, discountType: "AMOUNT" });
        setApplyPromo(true);
      }
    }
  }, []);

  // 🔄 REAL-TIME SYNC: If another person on the same table places an order while this
  // customer is on the cart screen, clear local NEW items and re-fetch from the server
  // so "Place Order" disappears and the cart reflects the confirmed order.
  useEffect(() => {
    if (!orderContext?.tableId) return;
    const tableId = String(orderContext.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
    const { socket: sharedSocket } = require("../../constants/socket");

    const handleCartUpdated = (data: { tableId: string; source?: string }) => {
      const incomingId = String(data.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
      if (incomingId === tableId) {
        if (data.source === "order_sent") {
          // 🔴 Another user placed an order: wipe local NEW drafts so Place Order button disappears
          const ctxId = useCartStore.getState().currentContextId;
          if (ctxId) {
            useCartStore.setState((state) => {
              const existing = state.carts[ctxId] || [];
              const clearedCart = existing.filter((item: any) => item.status && item.status !== "NEW");
              const newQtyMap: Record<string, number> = {};
              clearedCart.forEach((item: any) => { newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty; });
              return {
                carts: { ...state.carts, [ctxId]: clearedCart },
                cartQtyMap: { ...state.cartQtyMap, [ctxId]: newQtyMap },
                lastLocalUpdate: { ...state.lastLocalUpdate, [ctxId]: 0 },
              };
            });
          }
          useCartStore.getState().fetchCartFromDB(orderContext.tableId!, true);
        } else {
          // 🟡 Normal cart update (item added/edited): gentle fetch, keep local NEW items safe
          useCartStore.getState().fetchCartFromDB(orderContext.tableId!);
        }
      }
    };

    sharedSocket.on("cart_updated", handleCartUpdated);
    return () => { sharedSocket.off("cart_updated", handleCartUpdated); };
  }, [orderContext?.tableId]);

  const currentCart = (currentContextId ? carts[currentContextId] || [] : []).filter(item => item.status === "NEW" || !item.status);
  const totalItems = currentCart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.qty || 0), 0);

  const serviceChargePercentage = Number(settings?.serviceChargePercentage ?? settings?.ServiceChargePercentage ?? 0);
  const gstPercentage = Number(settings?.gstPercentage ?? settings?.GSTPercentage ?? 0);
  const takeawayChargeRate = Number(settings?.takeawayCharges ?? settings?.TakeawayCharges ?? settings?.takeawayCharge ?? settings?.TakeawayCharge ?? 0);
  const currencySymbol = settings?.currencySymbol ?? settings?.CurrencySymbol ?? "$";
  const showPromoCodeFeature = settings?.showPromoCode !== false && settings?.ShowPromoCode !== false;

  const memberCode = userInfo?.PromoCode || userInfo?.Promocode || userInfo?.promoCode || "";
  const memberAmount = Number(userInfo?.PromoAmount ?? userInfo?.Promoamount ?? userInfo?.promoAmount ?? 0);

  const activePromoCode = appliedPromo?.code || (applyPromo && memberCode ? memberCode : "") || (typeof localStorage !== "undefined" ? localStorage.getItem("promoCode") || "" : "");
  const activePromoAmount = appliedPromo?.amount ?? (memberCode ? memberAmount : 0);
  const activeDiscountType = (appliedPromo?.discountType || "AMOUNT").toUpperCase();
  const isPercentageDiscount = activeDiscountType === "PERCENTAGE" || activeDiscountType === "PERCENT";

  let rawDiscount = 0;
  if (applyPromo && activePromoCode && activePromoAmount > 0) {
    if (isPercentageDiscount) {
      rawDiscount = subtotal * (activePromoAmount / 100);
    } else {
      rawDiscount = Math.min(subtotal, activePromoAmount);
    }
  }
  const discountAmt = Math.max(0, Math.min(subtotal, rawDiscount));
  const netSubtotal = Math.max(0, subtotal - discountAmt);

  // Calculate service charge eligible subtotal (all dine-in items that are not takeaway)
  const scEligibleSubtotal = currentCart.reduce((sum, item) => {
    const isTakeaway = item.isTakeaway === true || String(item.isTakeaway) === "1" || String(item.isTakeaway).toLowerCase() === "true" || (item as any).IsTakeaway === true || String((item as any).IsTakeaway) === "1" || String((item as any).IsTakeaway).toLowerCase() === "true";
    const isSC = !isTakeaway && (Number(item.isServiceCharge) === 1 || item.isServiceCharge === true || Number((item as any).IsServiceCharge) === 1 || (item as any).IsServiceCharge === true);
    if (isSC) {
      return sum + (item.price || 0) * (item.qty || 0);
    }
    return sum;
  }, 0);

  // Calculate takeaway items quantity and charge
  const takeawayItemsQty = currentCart.reduce((sum, item) => {
    const isTakeaway = item.isTakeaway === true || String(item.isTakeaway) === "1" || String(item.isTakeaway).toLowerCase() === "true" || (item as any).IsTakeaway === true || String((item as any).IsTakeaway) === "1" || String((item as any).IsTakeaway).toLowerCase() === "true";
    if (isTakeaway) {
      return sum + (item.qty || 0);
    }
    return sum;
  }, 0);
  const takeawayChargeAmt = takeawayItemsQty * takeawayChargeRate;

  // Pro-rate service charge if discount is applied
  const serviceChargeAmt = Math.max(0, scEligibleSubtotal - discountAmt) * (serviceChargePercentage / 100);
  const totalBeforeGst = netSubtotal + serviceChargeAmt + takeawayChargeAmt;
  const gstAmt = totalBeforeGst * (gstPercentage / 100);
  const grandTotal = totalBeforeGst + gstAmt;

  const handleQtyChange = (lineItemId: string, currentQty: number, change: number) => {
    const newQty = currentQty + change;
    updateCartItemQty(lineItemId, newQty);
  };

  const handleApplyPromoCode = async () => {
    const codeToVerify = promoInput.trim().toUpperCase();
    if (!codeToVerify) {
      Alert.alert("Invalid Code", "Please enter a promo code.");
      return;
    }
    setValidatingPromo(true);
    try {
      const res = await fetch(`${API_URL}/api/members/promocode/${encodeURIComponent(codeToVerify)}`);
      const data = await res.json();
      if (res.ok && data.Promocode) {
        const amt = Number(data.Promoamount || data.DiscountValue || 0);
        if (amt <= 0) {
          Alert.alert("Invalid Promo", "This promo code has no remaining balance.");
          return;
        }
        const discType = (data.DiscountType || "AMOUNT").toUpperCase();
        setAppliedPromo({ code: data.Promocode, amount: amt, discountType: discType });
        setApplyPromo(true);
        setPromoInput("");
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("promoCode", data.Promocode);
        }

        // 🚀 Deduct promo amount in backend MemberMaster
        fetch(`${API_URL}/api/members/deduct-promo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promoCode: data.Promocode,
            amount: amt,
          }),
        }).catch((e) => console.error("Error deducting promo balance:", e));

        const discLabel = discType === "PERCENTAGE" || discType === "PERCENT" ? `${amt}%` : `${currencySymbol}${amt.toFixed(2)}`;
        Alert.alert("Promo Applied!", `Promo code ${data.Promocode} (${discLabel} off) applied successfully.`);
      } else {
        Alert.alert("Invalid Code", data.error || "Invalid or inactive promo code.");
      }
    } catch (err) {
      console.error("Promo verification error:", err);
      Alert.alert("Error", "Could not verify promo code. Please try again.");
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setApplyPromo(false);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("promoCode");
    }
  };

  const handlePlaceOrder = async () => {
    if (currentCart.length === 0) {
      Alert.alert("Cart Empty", "Please add items to your cart first.");
      return;
    }
    if (!orderContext?.tableId) {
      Alert.alert("Error", "Table session not found. Please restart.");
      return;
    }

    if (submitting || isAnimating) return;
    setIsAnimating(true);

    // 🚀 START PREMIUM MICRO-ANIMATION SEQUENCE (ROCKET LAUNCH)
    animButtonScale.setValue(1);
    animTextOpacity.setValue(1);
    animRocketScale.setValue(0);
    animRocketY.setValue(40);
    animShake.setValue(0);
    animSuccessOpacity.setValue(0);
    animButtonColor.setValue(0);
    animButtonWidth.setValue(1);

    const { Easing } = require("react-native");

    Animated.sequence([
      // 1. Press bounce down + start shrinking button width to circle (pill)
      Animated.parallel([
        Animated.timing(animButtonScale, {
          toValue: 0.94,
          duration: 150,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animButtonWidth, {
          toValue: 0, // Morph to circle
          duration: 350,
          easing: Easing.bezier(0.25, 1, 0.5, 1),
          useNativeDriver: false,
        }),
      ]),
      // 2. Snap back button scale while fading text out
      Animated.parallel([
        Animated.timing(animButtonScale, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(animTextOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      // 3. Load Rocket: Slide rocket in from below and scale it up
      Animated.parallel([
        Animated.timing(animRocketScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(animRocketY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // 4. Engine Ignition Tremble: Shake rocket left/right rapidly
      Animated.sequence([
        Animated.timing(animShake, { toValue: 4, duration: 50, useNativeDriver: true }),
        Animated.timing(animShake, { toValue: -4, duration: 50, useNativeDriver: true }),
        Animated.timing(animShake, { toValue: 4, duration: 50, useNativeDriver: true }),
        Animated.timing(animShake, { toValue: -4, duration: 50, useNativeDriver: true }),
        Animated.timing(animShake, { toValue: 3, duration: 50, useNativeDriver: true }),
        Animated.timing(animShake, { toValue: -3, duration: 50, useNativeDriver: true }),
        Animated.timing(animShake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]),
      // 5. BLASTOFF! Rocket shoots straight up into space
      Animated.parallel([
        Animated.timing(animRocketY, {
          toValue: -120, // Shoots straight out of button bounds
          duration: 350,
          easing: Easing.bezier(0.5, 0, 1, 1), // accelerating
          useNativeDriver: true,
        }),
        Animated.timing(animRocketScale, {
          toValue: 0.5, // Shrinks as it travels further away
          duration: 350,
          useNativeDriver: true,
        }),
      ]),
      // 6. Morph button back to full width + transition color to green
      Animated.parallel([
        Animated.timing(animButtonWidth, {
          toValue: 1, // Morph back to wide
          duration: 500,
          easing: Easing.bezier(0.25, 1, 0.5, 1),
          useNativeDriver: false,
        }),
        Animated.timing(animButtonColor, {
          toValue: 1, // Turn emerald green
          duration: 500,
          useNativeDriver: false,
        }),
      ]),
      // 7. Confirmed pop state (spring zoom + fade)
      Animated.timing(animSuccessOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.back(1.8)),
        useNativeDriver: true,
      }),
      // Hold state for satisfying impact
      Animated.delay(600),
    ]).start(async () => {
      setSubmitting(true);
      try {
        const sendResponse = await fetch(`${API_URL}/api/orders/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tableId: orderContext.tableId,
            orderType: "DINE_IN",
            entryStatus: "q",
            discountAmount: discountAmt,
            discountRemarks: applyPromo && activePromoCode ? `Applied Promo Code: ${activePromoCode}` : null,
            items: currentCart.map(item => ({
              id: item.id,
              lineItemId: item.lineItemId || item.id,
              name: item.name,
              qty: item.qty,
              price: item.price,
              modifiers: item.modifiers || [],
              status: "SENT",
              note: notes,
              isCombo: item.isCombo,
              comboSelections: item.comboSelections || [],
            }))
          })
        });

        if (sendResponse.ok) {
          // Update local storage promo amount on successful send
          if (applyPromo && activePromoCode) {
            const updatedAmount = Math.max(0, activePromoAmount - discountAmt);
            if (userInfo && typeof localStorage !== "undefined") {
              const updatedUser = { 
                ...userInfo, 
                PromoCode: activePromoCode, 
                PromoAmount: updatedAmount,
                Promocode: activePromoCode,
                Promoamount: updatedAmount 
              };
              localStorage.setItem("qr_pos_user", JSON.stringify(updatedUser));
              setUserInfo(updatedUser);
            }
            if (appliedPromo) {
              setAppliedPromo({ code: activePromoCode, amount: updatedAmount });
            }
            if (updatedAmount <= 0) {
              setApplyPromo(false);
            }
          }

          // ✅ IMMEDIATE CLEAR: Wipe all local "NEW" draft items right away
          const ctxId = currentContextId;
          if (ctxId) {
            useCartStore.setState((state) => {
              const existing = state.carts[ctxId] || [];
              const clearedCart = existing.filter(item => item.status && item.status !== "NEW");
              const newQtyMap: Record<string, number> = {};
              clearedCart.forEach(item => { newQtyMap[item.id] = (newQtyMap[item.id] || 0) + item.qty; });
              return {
                carts: { ...state.carts, [ctxId]: clearedCart },
                cartQtyMap: { ...state.cartQtyMap, [ctxId]: newQtyMap },
              };
            });
          }

          // Hydrate from DB to ensure state is synchronized with server
          if (orderContext.tableId) {
            await useCartStore.getState().fetchCartFromDB(orderContext.tableId, true);
          }
          
          // Reset animation triggers & show success modal
          setIsAnimating(false);
          setShowSuccessModal(true);
        } else {
          const errText = await sendResponse.text();
          console.error("Kitchen Send Error:", errText);
          Alert.alert("Order Failed", "Failed to send items to the kitchen. Please contact staff.");
          setIsAnimating(false);
        }
      } catch (err) {
        console.error("Error placing order:", err);
        Alert.alert("Network Error", "Failed to contact order server. Please try again.");
        setIsAnimating(false);
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cart</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Cart Items List */}
      <FlatList
        data={currentCart}
        keyExtractor={(item) => item.lineItemId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={64} color="#94A3B8" />
            <Text style={styles.emptyText}>Your cart is empty.</Text>
            <TouchableOpacity style={styles.shopBtn} onPress={() => router.push("/customer/menu" as any)}>
              <Text style={styles.shopBtnText}>Browse Menu</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>

              {/* Combo Selections */}
              {item.isCombo && item.comboSelections && item.comboSelections.length > 0 && (
                <View style={styles.comboSelectionsContainer}>
                  {item.comboSelections.map((group: any, gIdx: number) => {
                    const groupItemsText = group.items?.map((opt: any) => {
                      return opt.name + (Number(opt.surcharge) > 0 ? ` (+${currencySymbol}${Number(opt.surcharge).toFixed(2)})` : "");
                    }).join(", ");
                    return (
                      <Text key={gIdx} style={styles.comboSelectionText}>
                        {group.groupName}: {groupItemsText}
                      </Text>
                    );
                  })}
                </View>
              )}

              {/* Regular Modifiers */}
              {item.modifiers && item.modifiers.length > 0 && (
                <Text style={styles.itemMods}>
                  Customizations: {item.modifiers.map((m: any) => m.ModifierName || m.modifierName).join(", ")}
                </Text>
              )}

              <Text style={styles.itemPrice}>{currencySymbol}{(Number(item.price || 0) * (item.qty || 1)).toFixed(2)}</Text>
            </View>

            {/* Quantity control */}
            <View style={styles.qtyControls}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => handleQtyChange(item.lineItemId, item.qty, -1)}
              >
                <Ionicons name="remove" size={16} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.qty}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => handleQtyChange(item.lineItemId, item.qty, 1)}
              >
                <Ionicons name="add" size={16} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListFooterComponent={
          currentCart.length > 0 ? (
            <View style={styles.footerContainer}>
              {/* Cooking Instructions */}
              <Text style={styles.sectionTitle}>Cooking Instructions</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="E.g., No onions, extra spicy, less salt..."
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholderTextColor="#94A3B8"
              />



              {/* Bill Details */}
              <Text style={styles.sectionTitle}>Bill Details</Text>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Gross Total</Text>
                <Text style={styles.billValue}>{currencySymbol}{subtotal.toFixed(2)}</Text>
              </View>
              
              {applyPromo && discountAmt > 0 && (
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, { color: "#FF5E1A", fontWeight: "700" }]}>Promo Discount ({activePromoCode})</Text>
                  <Text style={[styles.billValue, { color: "#FF5E1A", fontWeight: "700" }]}>-{currencySymbol}{discountAmt.toFixed(2)}</Text>
                </View>
              )}
              {serviceChargePercentage > 0 && (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Item SVC ({serviceChargePercentage}%)</Text>
                  <Text style={styles.billValue}>{currencySymbol}{serviceChargeAmt.toFixed(2)}</Text>
                </View>
              )}
              {takeawayChargeAmt > 0 && (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Takeaway Charge</Text>
                  <Text style={styles.billValue}>{currencySymbol}{takeawayChargeAmt.toFixed(2)}</Text>
                </View>
              )}
              {gstPercentage > 0 && (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>GST ({gstPercentage}%)</Text>
                  <Text style={styles.billValue}>{currencySymbol}{gstAmt.toFixed(2)}</Text>
                </View>
              )}
              <View style={[styles.billRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Grand Total</Text>
                <Text style={styles.totalValue}>{currencySymbol}{grandTotal.toFixed(2)}</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Place Order Bar */}
      {currentCart.length > 0 && (
        <Animated.View 
          style={[
            styles.checkoutBar, 
            { 
              transform: [{ scale: animButtonScale }],
              backgroundColor: animButtonColor.interpolate({
                inputRange: [0, 1],
                outputRange: [Theme.primary, "#059669"], // Emerald success green
              }),
              width: animButtonWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ["16%", "100%"], // Shrinks to small circle then grows back
              }),
              alignSelf: "center", // Keeps it centered as it morphs
              borderRadius: animButtonWidth.interpolate({
                inputRange: [0, 1],
                outputRange: [28, 16], // Becomes fully circular when small
              }),
            }
          ]}
        >
            <TouchableOpacity style={styles.orderBtn} onPress={handlePlaceOrder} disabled={isAnimating || submitting}>
              {/* Default text state */}
              <Animated.View style={[styles.btnTextContainer, { opacity: animTextOpacity }]}>
                <Text style={styles.orderBtnText}>Place Order • {currencySymbol}{grandTotal.toFixed(2)}</Text>
              </Animated.View>

              {/* Animated Rocket Launch Capsule */}
              <Animated.View
                style={[
                  styles.animatedItem,
                  {
                    transform: [
                      { scale: animRocketScale },
                      { translateY: animRocketY },
                      { translateX: animShake },
                      { rotate: "-45deg" }, // tilts the paper plane to point straight up
                    ],
                  },
                ]}
              >
                <Ionicons name="paper-plane-outline" size={28} color="#FFF" />
              </Animated.View>

              {/* Confirmed / success state */}
              <Animated.View style={[styles.successContainer, { opacity: animSuccessOpacity }]}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={22} color="#FFF" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.orderBtnText}>{submitting ? "Sending..." : "Confirmed!"}</Text>
              </Animated.View>
            </TouchableOpacity>
        </Animated.View>
      )}

      {/* Beautiful Premium Custom Success Modal */}
      {showSuccessModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.modalTitle}>Order Placed!</Text>
            <Text style={styles.modalSubtitle}>Your delicious selection has been sent straight to the kitchen.</Text>
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={() => {
                setShowSuccessModal(false);
                router.replace("/customer/order-status" as any);
              }}
            >
              <Text style={styles.modalButtonText}>Track Order Status</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F172A",
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: "#64748B",
    marginTop: 16,
  },
  shopBtn: {
    marginTop: 20,
    backgroundColor: Theme.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shopBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  cartItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },
  itemMods: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  comboSelectionsContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  comboSelectionText: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.primary,
    marginTop: 6,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 2,
  },
  qtyBtn: {
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0F172A",
    marginHorizontal: 12,
  },
  footerContainer: {
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 100,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 12,
    marginTop: 8,
  },
  notesInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    height: 80,
    color: "#0F172A",
    textAlignVertical: "top",
    fontSize: 14,
    marginBottom: 16,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  billLabel: {
    color: "#64748B",
    fontSize: 14,
  },
  billValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "500",
  },
  totalRow: {
    borderTopWidth: 1,
    borderColor: "#F1F5F9",
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "bold",
  },
  totalValue: {
    color: Theme.primary,
    fontSize: 18,
    fontWeight: "bold",
  },
  checkoutBar: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: Theme.primary,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
    overflow: "hidden", // 🔑 CLIPS THE ROLL-OFF ANIMATION WITHIN BUTTON BOUNDS
  },
  orderBtn: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  orderBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    width: "85%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    backgroundColor: "#E6F4EA",
    padding: 16,
    borderRadius: 50,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  btnTextContainer: {
    position: "absolute",
    alignSelf: "center",
  },
  animatedItem: {
    position: "absolute",
    alignSelf: "center",
  },
  successContainer: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
