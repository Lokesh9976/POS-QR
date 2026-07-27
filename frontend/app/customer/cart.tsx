import React, { useState } from "react";
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
  
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [userInfo, setUserInfo] = useState<{ UserName: string; FullName: string; Phone: string; Email?: string; PromoCode?: string; PromoAmount?: number } | null>(null);
  const [applyPromo, setApplyPromo] = useState(false);

  React.useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("qr_pos_user");
      if (stored) {
        try {
          setUserInfo(JSON.parse(stored));
        } catch (e) {}
      }
    }
  }, []);

  const currentCart = (currentContextId ? carts[currentContextId] || [] : []).filter(item => item.status === "NEW" || !item.status);
  const totalItems = currentCart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.qty || 0), 0);

  const serviceChargePercentage = Number(settings?.serviceChargePercentage ?? settings?.ServiceChargePercentage ?? 0);
  const gstPercentage = Number(settings?.gstPercentage ?? settings?.GSTPercentage ?? 0);
  const takeawayChargeRate = Number(settings?.takeawayCharges ?? settings?.TakeawayCharges ?? settings?.takeawayCharge ?? settings?.TakeawayCharge ?? 0);
  const currencySymbol = settings?.currencySymbol ?? settings?.CurrencySymbol ?? "$";

  const discountAmt = applyPromo ? Math.min(subtotal, Number(userInfo?.PromoAmount || 0)) : 0;
  const netSubtotal = subtotal - discountAmt;

  // Calculate service charge eligible subtotal (all dine-in items that are not takeaway)
  const scEligibleSubtotal = currentCart.reduce((sum, item) => {
    const isTakeaway = item.isTakeaway === true || String(item.isTakeaway) === "1" || String(item.isTakeaway).toLowerCase() === "true" || (item as any).IsTakeaway === true || String((item as any).IsTakeaway) === "1" || String((item as any).IsTakeaway).toLowerCase() === "true";
    if (!isTakeaway) {
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

  const handlePlaceOrder = async () => {
    if (currentCart.length === 0) {
      Alert.alert("Cart Empty", "Please add items to your cart first.");
      return;
    }
    if (!orderContext?.tableId) {
      Alert.alert("Error", "Table session not found. Please restart.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    try {
      // 1. Call the send API to commit these items to the kitchen (marks them SENT and triggers KOT)
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
          discountRemarks: applyPromo && userInfo?.PromoCode ? `Applied Promo Code: ${userInfo.PromoCode}` : null,
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
        if (applyPromo && userInfo) {
          const updatedAmount = Math.max(0, Number(userInfo.PromoAmount || 0) - discountAmt);
          const updatedUser = { ...userInfo, PromoAmount: updatedAmount };
          localStorage.setItem("qr_pos_user", JSON.stringify(updatedUser));
          setUserInfo(updatedUser);
          setApplyPromo(false);
        }

        // Clear local unsent cart items and skip background save-cart to prevent race conditions
        useCartStore.getState().markAllAsSent(true);
        
        // Hydrate from DB to ensure state is synchronized with server (forces bypass of Latency Shield)
        await useCartStore.getState().fetchCartFromDB(orderContext.tableId, true);
        
        // Show beautiful custom modal
        setShowSuccessModal(true);
      } else {
        const errText = await sendResponse.text();
        console.error("Kitchen Send Error:", errText);
        Alert.alert("Order Failed", "Failed to send items to the kitchen. Please contact staff.");
      }
    } catch (err) {
      console.error("Error placing order:", err);
      Alert.alert("Network Error", "Failed to contact order server. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
                      return opt.name + (Number(opt.surcharge) > 0 ? ` (+$${Number(opt.surcharge).toFixed(2)})` : "");
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

              <Text style={styles.itemPrice}>${(Number(item.price || 0) * (item.qty || 1)).toFixed(2)}</Text>
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
              {userInfo?.PromoCode && Number(userInfo?.PromoAmount) > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF2EC", padding: 12, borderRadius: 12, marginVertical: 8, borderWidth: 1, borderColor: "#FFD2BD" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="gift" size={20} color="#FF5E1A" />
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>Apply Promo Coupon ({userInfo.PromoCode})</Text>
                      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Available Balance: {currencySymbol}{Number(userInfo.PromoAmount).toFixed(2)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={{ backgroundColor: applyPromo ? "#FF5E1A" : "#fff", borderWidth: 1.5, borderColor: "#FF5E1A", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                    onPress={() => setApplyPromo(!applyPromo)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: applyPromo ? "#fff" : "#FF5E1A" }}>
                      {applyPromo ? "Applied" : "Apply"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {applyPromo && discountAmt > 0 && (
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, { color: "#FF5E1A", fontWeight: "700" }]}>Promo Discount</Text>
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
        <View style={styles.checkoutBar}>
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <TouchableOpacity style={styles.orderBtn} onPress={handlePlaceOrder}>
              <Text style={styles.orderBtnText}>Place Order • {currencySymbol}{grandTotal.toFixed(2)}</Text>
            </TouchableOpacity>
          )}
        </View>
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
});
