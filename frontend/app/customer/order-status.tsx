import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Theme } from "../../constants/theme";
import { useCartStore } from "../../stores/cartStore";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { socket } from "../../constants/socket";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "../../constants/Config";

export default function CustomerOrderStatusScreen() {
  const router = useRouter();
  const { carts, currentContextId, fetchCartFromDB, checkoutOrder } = useCartStore();
  const orderContext = useOrderContextStore((state) => state.currentOrder);

  const currentCart = currentContextId ? carts[currentContextId] || [] : [];
  const activeItems = currentCart.filter((item) => item.status && item.status !== "VOIDED");
  const allServed = activeItems.length > 0 && activeItems.every((item) => item.status === "SERVED");

  // Determine overall status
  const getOverallStatus = () => {
    if (activeItems.length === 0) return "No active orders";
    const hasSent = activeItems.some((i) => i.status === "SENT");
    const hasReady = activeItems.some((i) => i.status === "READY");
    const allServed = activeItems.every((i) => i.status === "SERVED");

    if (allServed) return "All Served";
    if (hasReady) return "Ready to Serve";
    if (hasSent) return "Preparing in Kitchen";
    return "Received";
  };

  const [isSettled, setIsSettled] = useState(false);
  const [showConfirmBillModal, setShowConfirmBillModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isSessionClosed, setIsSessionClosed] = useState(false);
  const [upiId, setUpiId] = useState<string | null>(null);
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [paymentSent, setPaymentSent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cashier" | "online" | null>(null);

  const confirmLogout = () => {
    if (orderContext?.tableId) {
      useCartStore.getState().clearTableSession(orderContext.tableId);
    }
    useOrderContextStore.getState().setOrderContext(null as any);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("qr_pos_user");
    }
    setShowLogoutModal(false);
    setIsSessionClosed(true);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.close();
      } catch (e) {}
    }
  };

  if (isSessionClosed) {
    return (
      <View style={styles.sessionClosedContainer}>
        <View style={styles.sessionClosedCard}>
          <View style={styles.sessionClosedIconWrap}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" />
          </View>
          <Text style={styles.sessionClosedTitle}>Session Closed</Text>
          <Text style={styles.sessionClosedSubtitle}>
            Thank you for dining with us! Your session has been closed. You may now close this browser tab.
          </Text>
          {Platform.OS === "web" && (
            <TouchableOpacity
              style={styles.closeWindowBtn}
              onPress={() => {
                try {
                  window.close();
                } catch (e) {}
                window.location.href = "about:blank";
              }}
            >
              <Ionicons name="power-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.closeWindowBtnText}>Close Tab</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }



  useEffect(() => {
    if (orderContext?.tableId) {
      fetchCartFromDB(orderContext.tableId);
    }
  }, []);

  useEffect(() => {
    if (!orderContext?.tableId) return;

    const handleOrderClosed = (payload: { tableId?: string }) => {
      const cleanTarget = String(payload.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
      const cleanCurrent = String(orderContext.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
      if (cleanTarget === cleanCurrent) {
        setIsSettled(true);
      }
    };

    const handleTableStatus = (payload: { tableId?: string; status?: number }) => {
      const cleanTarget = String(payload.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
      const cleanCurrent = String(orderContext.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
      if (cleanTarget === cleanCurrent && payload.status === 0) {
        setIsSettled(true);
      }
    };

    socket.on("order_closed", handleOrderClosed);
    socket.on("table_status_updated", handleTableStatus);

    return () => {
      socket.off("order_closed", handleOrderClosed);
      socket.off("table_status_updated", handleTableStatus);
    };
  }, [orderContext]);

  if (isSettled) {
    return (
      <View style={styles.settledContainer}>
        <View style={styles.settledCard}>
          <View style={styles.checkWrap}>
            <Ionicons name="sparkles" size={48} color={Theme.primary} />
          </View>
          <Text style={styles.settledTitle}>Thank You!</Text>
          <Text style={styles.settledSubtitle}>Your order has been fully settled and paid. We hope you enjoyed your meal!</Text>
          
          <TouchableOpacity 
            style={styles.doneBtn} 
            onPress={() => {
              const tid = orderContext?.tableId;
              const tno = orderContext?.tableNo;
              const sec = orderContext?.section || "SECTION_1";
              if (tid) {
                useCartStore.getState().clearTableSession(tid);
              }
              if (tid && tno) {
                router.replace({
                  pathname: "/customer/menu" as any,
                  params: { tableId: tid, tableNo: tno, section: sec },
                });
              } else {
                router.replace("/customer/menu" as any);
              }
            }}
          >
            <Text style={styles.doneBtnText}>Back to Menu</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const executeSendRequest = async (type: string) => {
    if (!orderContext?.tableId || !orderContext?.tableNo) return;
    // Emit real-time customer request via socket
    socket.emit("customer_request", {
      tableNo: orderContext.tableNo,
      tableId: orderContext.tableId,
      type: type,
      timestamp: Date.now(),
    });
  };

  const fetchUpiId = async () => {
    setLoadingUpi(true);
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      const data = await res.json();
      // AppSettings stores UPI as UPI_ID
      setUpiId(data?.UPI_ID || data?.upiId || null);
    } catch (e) {
      setUpiId(null);
    } finally {
      setLoadingUpi(false);
    }
  };

  const handleConfirmBill = async () => {
    setShowConfirmBillModal(false);
    // Fetch UPI settings in background while showing payment modal
    fetchUpiId();
    setShowPaymentModal(true);
  };

  const handlePayAtCashier = async () => {
    if (!orderContext?.tableId || !orderContext?.tableNo) return;
    try {
      await checkoutOrder(orderContext.tableId);
    } catch (err) {
      console.error("Checkout error:", err);
    }
    executeSendRequest("Request Bill");
    setPaymentMethod("cashier");
    setPaymentSent(true);
  };

  const handleOnlinePayment = () => {
    setPaymentMethod("online");
    setPaymentSent(true);
  };

  const handleSendRequest = async (type: string) => {
    if (!orderContext?.tableNo || !orderContext?.tableId) {
      Alert.alert("Error", "No active table session found.");
      return;
    }
    if (type === "Request Bill") {
      setShowConfirmBillModal(true);
    } else {
      executeSendRequest(type);
      Alert.alert("Request Sent", `A waiter has been notified for: ${type}`);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "SERVED":
        return "#10B981"; // Green
      case "READY":
        return "#3B82F6"; // Blue
      case "SENT":
        return "#F59E0B"; // Amber
      default:
        return "#64748B";
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };


  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/customer/menu")}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Status</Text>
        <TouchableOpacity
          style={{
            padding: 6,
            borderRadius: 8,
            backgroundColor: "#FEF2F2",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current Table Status</Text>
          <Text style={styles.statusValue}>{getOverallStatus()}</Text>
          
          {/* Tracking timeline */}
          <View style={styles.timeline}>
            <View style={styles.timelineStep}>
              <View style={[styles.stepDot, { backgroundColor: Theme.primary }]} />
              <Text style={styles.stepText}>Received</Text>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineStep}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      getOverallStatus() !== "Received" && getOverallStatus() !== "No active orders"
                        ? Theme.primary
                        : "#E2E8F0",
                  },
                ]}
              />
              <Text style={styles.stepText}>Preparing</Text>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineStep}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      getOverallStatus() === "Ready to Serve" || getOverallStatus() === "All Served"
                        ? Theme.primary
                        : "#E2E8F0",
                  },
                ]}
              />
              <Text style={styles.stepText}>Served</Text>
            </View>
          </View>
        </View>

        {/* Quick Customer Requests */}
        <Text style={styles.sectionTitle}>Request Service</Text>
        <View style={styles.requestsGrid}>
          <TouchableOpacity style={styles.requestBtn} onPress={() => handleSendRequest("Call Waiter")}>
            <Ionicons name="notifications-outline" size={24} color={Theme.primary} />
            <Text style={styles.requestBtnText}>Call Waiter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.requestBtn} onPress={() => handleSendRequest("Request Water")}>
            <Ionicons name="water-outline" size={24} color={Theme.primary} />
            <Text style={styles.requestBtnText}>Water</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.requestBtn} onPress={() => handleSendRequest("Request Spoon/Fork")}>
            <Ionicons name="restaurant-outline" size={24} color={Theme.primary} />
            <Text style={styles.requestBtnText}>Cutlery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.requestBtn} onPress={() => handleSendRequest("Request Tissue")}>
            <Ionicons name="document-text-outline" size={24} color={Theme.primary} />
            <Text style={styles.requestBtnText}>Tissue</Text>
          </TouchableOpacity>
          {allServed && (
            <TouchableOpacity style={styles.requestBtn} onPress={() => handleSendRequest("Request Bill")}>
              <Ionicons name="wallet-outline" size={24} color={Theme.primary} />
              <Text style={styles.requestBtnText}>Request Bill</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* Ordered items details */}
        <Text style={styles.sectionTitle}>Order Details</Text>
        {activeItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items ordered yet.</Text>
          </View>
        ) : (
          activeItems.map((item) => (
            <View key={item.lineItemId} style={styles.itemRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.itemName}>{item.name}</Text>

                {/* Combo Selections */}
                {item.isCombo && item.comboSelections && item.comboSelections.length > 0 && (
                  <View style={styles.comboSelectionsContainer}>
                    {item.comboSelections.map((group: any, gIdx: number) => {
                      const groupItemsText = group.items?.map((opt: any) => opt.name).join(", ");
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

                <Text style={styles.itemQty}>Qty: {item.qty}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
                <Text style={[styles.statusBadgeText, { color: getStatusColor(item.status) }]}>
                  {item.status || "SENT"}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Add Dish Button */}
        <TouchableOpacity 
          style={styles.addDishButton} 
          onPress={() => router.replace("/customer/menu" as any)}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.addDishButtonText}>Add Dish (Order More)</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Step 1: Confirm Bill Modal */}
      {showConfirmBillModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.iconContainer}>
              <Ionicons name="wallet-outline" size={32} color={Theme.primary} />
            </View>
            <Text style={styles.modalTitle}>Request Bill</Text>
            <Text style={styles.modalSubtitle}>Are you sure you want to request your bill? This will notify our staff to prepare your invoice.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelBtn]} 
                onPress={() => setShowConfirmBillModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmBtn]} 
                onPress={handleConfirmBill}
              >
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Step 2: Payment Method Modal */}
      {showPaymentModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 380 }]}>
            {!paymentSent ? (
              <>
                <View style={styles.iconContainer}>
                  <Ionicons name="card-outline" size={32} color={Theme.primary} />
                </View>
                <Text style={styles.modalTitle}>Choose Payment</Text>
                <Text style={styles.modalSubtitle}>How would you like to pay?</Text>

                {/* Pay at Cashier */}
                <TouchableOpacity style={styles.payOptionBtn} onPress={handlePayAtCashier}>
                  <View style={styles.payOptionIcon}>
                    <Ionicons name="storefront-outline" size={28} color={Theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payOptionTitle}>Pay at Cashier</Text>
                    <Text style={styles.payOptionDesc}>Staff will be notified to come to your table</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </TouchableOpacity>

                {/* Online Payment */}
                <TouchableOpacity style={styles.payOptionBtn} onPress={handleOnlinePayment}>
                  <View style={styles.payOptionIcon}>
                    <Ionicons name="qr-code-outline" size={28} color="#8B5CF6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payOptionTitle}>Online Payment</Text>
                    <Text style={styles.payOptionDesc}>Pay via UPI / QR code</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelBtn, { marginTop: 8, width: "100%" }]}
                  onPress={() => { setShowPaymentModal(false); setPaymentSent(false); setPaymentMethod(null); }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : paymentMethod === "cashier" ? (
              /* Cashier confirmation */
              <>
                <View style={[styles.iconContainer, { backgroundColor: "#D1FAE5" }]}>
                  <Ionicons name="checkmark-circle" size={40} color="#10B981" />
                </View>
                <Text style={styles.modalTitle}>Staff Notified!</Text>
                <Text style={styles.modalSubtitle}>Our staff is on the way. Please wait at your table and pay at the cashier.</Text>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmBtn, { width: "100%", marginTop: 8 }]}
                  onPress={() => { setShowPaymentModal(false); setPaymentSent(false); setPaymentMethod(null); }}
                >
                  <Text style={styles.confirmBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Online Payment / UPI QR */
              <>
                <View style={[styles.iconContainer, { backgroundColor: "#EDE9FE" }]}>
                  <Ionicons name="qr-code" size={36} color="#8B5CF6" />
                </View>
                <Text style={styles.modalTitle}>Scan to Pay</Text>
                {loadingUpi ? (
                  <ActivityIndicator color={Theme.primary} style={{ marginVertical: 24 }} />
                ) : upiId ? (
                  <>
                    <Text style={[styles.modalSubtitle, { marginBottom: 8 }]}>
                      Scan QR with any UPI app
                    </Text>
                    <Image
                      source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=${encodeURIComponent(upiId)}&cu=INR` }}
                      style={styles.upiQr}
                    />
                    <Text style={styles.upiIdText}>{upiId}</Text>
                  </>
                ) : (
                  <Text style={[styles.modalSubtitle, { color: "#EF4444" }]}>
                    Online payment not configured. Please pay at the cashier.
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmBtn, { width: "100%", marginTop: 8 }]}
                  onPress={() => { setShowPaymentModal(false); setPaymentSent(false); setPaymentMethod(null); }}
                >
                  <Text style={styles.confirmBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* Custom Logout Confirmation Modal */}

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.logoutModalCard}>
            <View style={styles.logoutIconCircle}>
              <Ionicons name="log-out-outline" size={32} color="#EF4444" />
            </View>
            <Text style={styles.logoutModalTitle}>Log Out & Exit</Text>
            <Text style={styles.logoutModalSubtitle}>
              Are you sure you want to log out? Your table ordering session will be closed.
            </Text>
            <View style={styles.logoutModalActions}>
              <TouchableOpacity
                style={styles.cancelLogoutBtn}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.cancelLogoutText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmLogoutBtn}
                onPress={confirmLogout}
              >
                <Text style={styles.confirmLogoutText}>Yes, Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
    alignItems: "center",
    marginBottom: 24,
  },
  statusLabel: {
    fontSize: 12,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0F172A",
    marginVertical: 8,
  },
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    width: "80%",
    justifyContent: "space-between",
  },
  timelineStep: {
    alignItems: "center",
  },
  stepDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#E2E8F0",
  },
  stepText: {
    fontSize: 11,
    color: "#475569",
    marginTop: 6,
    fontWeight: "500",
  },
  timelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 4,
    marginTop: -16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 12,
  },
  requestsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  requestBtn: {
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  requestBtnText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    marginTop: 6,
    textAlign: "center",
  },
  emptyContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    color: "#64748B",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  itemQty: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  addDishButton: {
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 16,
    marginTop: 20,
    marginBottom: 40,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addDishButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  settledContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  settledCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  checkWrap: {
    backgroundColor: "#FFF7ED",
    padding: 24,
    borderRadius: 50,
    marginBottom: 24,
  },
  settledTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 12,
    textAlign: "center",
  },
  settledSubtitle: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  doneBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
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
  itemMods: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 4,
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 24,
    width: "85%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
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
  modalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  cancelBtnText: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 15,
  },
  confirmBtn: {
    backgroundColor: Theme.primary,
  },
  confirmBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  payOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    width: "100%",
    gap: 12,
  },
  payOptionIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  payOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  payOptionDesc: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  upiQr: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginVertical: 12,
    alignSelf: "center",
  },
  upiIdText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  logoutModalCard: {

    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  logoutIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoutModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 8,
  },
  logoutModalSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  logoutModalActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelLogoutBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  cancelLogoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  confirmLogoutBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
  confirmLogoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  sessionClosedContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sessionClosedCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    maxWidth: 420,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  sessionClosedIconWrap: {
    marginBottom: 16,
  },
  sessionClosedTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 8,
  },
  sessionClosedSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  closeWindowBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  closeWindowBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
});

