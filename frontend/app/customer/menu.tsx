import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
  Animated,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Theme } from "../../constants/theme";
import { useMenuStore } from "../../stores/menuStore";
import { useCartStore } from "../../stores/cartStore";
import { useOrderContextStore } from "../../stores/orderContextStore";
import { API_URL } from "../../constants/Config";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function CustomerMenuScreen() {
  const router = useRouter();
  const { kitchens, allDishes, fetchMenu, fetchGroups, isLoading } = useMenuStore();
  const { carts, currentContextId, addToCartGlobal } = useCartStore();
  const orderContext = useOrderContextStore((state) => state.currentOrder);

  const [search, setSearch] = useState("");
  const [selectedKitchenId, setSelectedKitchenId] = useState<string | null>(null);
  const [dishGroups, setDishGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isSessionClosed, setIsSessionClosed] = useState(false);

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


  
  // Slide animation for floating cart
  const cartSlideAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    fetchMenu();
  }, []);

  const currentCart = (currentContextId ? carts[currentContextId] || [] : []).filter(item => item.status === "NEW" || !item.status);
  const totalItems = currentCart.reduce((sum, item) => sum + (item.qty || 0), 0);
  const subtotal = currentCart.reduce((sum, item) => sum + (item.price || 0) * (item.qty || 0), 0);

  // Trigger floating cart entrance
  useEffect(() => {
    if (totalItems > 0) {
      Animated.spring(cartSlideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(cartSlideAnim, {
        toValue: 100,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [totalItems]);

  // Load first kitchen by default
  useEffect(() => {
    if (kitchens.length > 0 && !selectedKitchenId) {
      setSelectedKitchenId(kitchens[0].CategoryId);
    }
  }, [kitchens]);

  // Load groups for the selected Category
  useEffect(() => {
    if (selectedKitchenId) {
      fetchGroups(selectedKitchenId).then((groups) => {
        setDishGroups(groups);
        if (groups && groups.length > 0) {
          setSelectedGroupId(groups[0].DishGroupId);
        } else {
          setSelectedGroupId(null);
        }
      });
    }
  }, [selectedKitchenId]);

  const filteredDishes = allDishes.filter((dish: any) => {
    const query = search.trim().toLowerCase();
    if (query.length > 0) {
      const nameMatch = dish.Name?.toLowerCase().includes(query);
      const descMatch = dish.Description?.toLowerCase().includes(query);
      return nameMatch || descMatch;
    }
    
    // Check if the dish's group belongs to the currently selected category
    const belongsToCategory = dishGroups.some(g => g.DishGroupId === dish.DishGroupId);
    
    // If a group is selected, match it; otherwise ensure it belongs to the selected category
    const matchesGroup = selectedGroupId
      ? dish.DishGroupId === selectedGroupId
      : belongsToCategory;
      
    return matchesGroup;
  });

  const handleAddSimple = (dish: any) => {
    // If it has modifiers/combo selection, navigate to customizer screen
    // For now we check if there are modifiers (we can load them or let item-details fetch)
    // We navigate to details screen for customizer
    router.push({
      pathname: "/customer/item-details" as any,
      params: { dishId: dish.DishId },
    });
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/customer" as any)}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Menu</Text>
          {orderContext?.tableNo && (
            <Text style={styles.tableBadge}>Table {orderContext.tableNo}</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity style={styles.requestButton} onPress={() => router.push("/customer/order-status" as any)}>
            <Ionicons name="receipt-outline" size={22} color={Theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search delicious food..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94A3B8"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal Category Pill Bar */}
      <View style={styles.categoriesContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={kitchens}
          keyExtractor={(item) => item.CategoryId}
          renderItem={({ item }) => {
            const isSelected = selectedKitchenId === item.CategoryId;
            return (
              <TouchableOpacity
                style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
                onPress={() => setSelectedKitchenId(item.CategoryId)}
              >
                <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                  {item.KitchenTypeName}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.categoriesContent}
        />
      </View>

      {/* Horizontal Dish Group Pill Bar */}
      {dishGroups.length > 0 && (
        <View style={styles.groupsContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={dishGroups}
            keyExtractor={(item) => item.DishGroupId}
            renderItem={({ item }) => {
              const isSelected = selectedGroupId === item.DishGroupId;
              return (
                <TouchableOpacity
                  style={[styles.groupPill, isSelected && styles.groupPillSelected]}
                  onPress={() => setSelectedGroupId(item.DishGroupId)}
                >
                  <Text style={[styles.groupText, isSelected && styles.groupTextSelected]}>
                    {item.DishGroupName}
                  </Text>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.groupsContent}
          />
        </View>
      )}

      {/* Main Dishes Catalog */}
      {isLoading ? (
        <ActivityIndicator size="large" color={Theme.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={filteredDishes}
          keyExtractor={(item) => item.DishId || item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="restaurant-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyText}>No items found in this category.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.dishCard}>
              <Image
                source={{
                  uri: item.Image
                    ? `${API_URL}/api/menu/image/${item.Image}`
                    : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=150",
                }}
                style={styles.dishImage}
              />
              <View style={styles.dishInfo}>
                <Text style={styles.dishName}>{item.Name}</Text>
                <Text style={styles.dishDescription} numberOfLines={2}>
                  {item.Description || "Delicious traditional recipe crafted with fresh ingredients."}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.dishPrice}>${Number(item.Price || 0).toFixed(2)}</Text>
                  <TouchableOpacity style={styles.addButton} onPress={() => handleAddSimple(item)}>
                    <Text style={styles.addButtonText}>Customize</Text>
                    <Ionicons name="add" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Floating Uber-style Cart Bar */}
      <Animated.View style={[styles.floatingCart, { transform: [{ translateY: cartSlideAnim }] }]}>
        <View style={styles.cartContent}>
          <View>
            <Text style={styles.cartItemsCount}>
              {totalItems} {totalItems === 1 ? "Item" : "Items"}
            </Text>
            <Text style={styles.cartTotal}>${subtotal.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.viewCartBtn} onPress={() => router.push("/customer/cart" as any)}>
            <Text style={styles.viewCartText}>View Cart</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </Animated.View>


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
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F172A",
  },
  tableBadge: {
    marginLeft: 8,
    backgroundColor: "#E2E8F0",
    color: "#475569",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  requestButton: {
    padding: 8,
  },
  logoutButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 15,
  },
  categoriesContainer: {
    backgroundColor: "#F8FAFC",
    paddingBottom: 4,
  },
  categoriesContent: {
    paddingHorizontal: 16,
  },
  groupsContainer: {
    backgroundColor: "#F8FAFC",
    paddingBottom: 10,
    paddingTop: 4,
  },
  groupsContent: {
    paddingHorizontal: 16,
  },
  groupPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 6,
  },
  groupPillSelected: {
    backgroundColor: "#fff",
    borderColor: Theme.primary,
    borderWidth: 1.5,
  },
  groupText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  groupTextSelected: {
    color: "#0F172A",
    fontWeight: "700",
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    marginRight: 8,
  },
  categoryPillSelected: {
    backgroundColor: Theme.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  categoryTextSelected: {
    color: "#fff",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
  },
  emptyText: {
    color: "#64748B",
    marginTop: 12,
    fontSize: 15,
  },
  dishCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  dishImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  dishInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "space-between",
  },
  dishName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },
  dishDescription: {
    fontSize: 12,
    color: "#64748B",
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  dishPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.primary,
  },
  addButton: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 4,
  },
  floatingCart: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "#1E293B",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  cartContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  cartItemsCount: {
    color: "#94A3B8",
    fontSize: 12,
  },
  cartTotal: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  viewCartBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  viewCartText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
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

