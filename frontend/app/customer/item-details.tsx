import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Theme } from "../../constants/theme";
import { useMenuStore } from "../../stores/menuStore";
import { useCartStore } from "../../stores/cartStore";
import { API_URL } from "../../constants/Config";
import { Ionicons } from "@expo/vector-icons";

export default function CustomerItemDetailsScreen() {
  const router = useRouter();
  const { dishId } = useLocalSearchParams();
  const { allDishes } = useMenuStore();
  const { addToCartGlobal } = useCartStore();

  const [dish, setDish] = useState<any>(null);
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  const [comboConfig, setComboConfig] = useState<any>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const selected = allDishes.find((d: any) => String(d.DishId) === String(dishId));
    if (selected) {
      setDish(selected);
      fetchModifiers(selected.DishId);
      const isCombo = selected.isCombo === true || String(selected.isCombo) === "1" || selected.isCombo === 1 || selected.IsCombo === true || String(selected.IsCombo) === "1" || selected.IsCombo === 1;
      if (isCombo) {
        fetchComboConfig(selected.DishId);
      }
    } else {
      setLoading(false);
    }
  }, [dishId]);

  const fetchModifiers = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/menu/modifiers/${id}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setModifiers(data);
      }
    } catch (err) {
      console.error("Error fetching modifiers:", err);
    } finally {
      const selected = allDishes.find((d: any) => String(d.DishId) === String(dishId));
      const isCombo = selected?.isCombo === true || String(selected?.isCombo) === "1" || selected?.isCombo === 1 || selected?.IsCombo === true || String(selected?.IsCombo) === "1" || selected?.IsCombo === 1;
      if (!isCombo) {
        setLoading(false);
      }
    }
  };

  const fetchComboConfig = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/combo/config/${id}`);
      const payload = await res.json();
      if (payload.success && payload.data) {
        setComboConfig(payload.data);
        
        // Initialize default selections
        const initialSelections: Record<string, string[]> = {};
        const rawGroups = payload.data.groups || [];
        rawGroups.forEach((g: any) => {
          const defaultOpt = g.options?.find((o: any) => o.isDefault);
          if (defaultOpt) {
            initialSelections[g.comboGroupId] = [defaultOpt.dishId];
          } else if (g.options?.length > 0 && g.minSelection > 0) {
            initialSelections[g.comboGroupId] = [g.options[0].dishId];
          }
        });
        setSelections(initialSelections);
      }
    } catch (err) {
      console.error("Error fetching combo config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (groupId: string, optionDishId: string, isMulti: boolean, minSel: number, maxSel: number) => {
    const current = selections[groupId] || [];
    if (isMulti) {
      if (current.includes(optionDishId)) {
        if (current.length > minSel) {
          setSelections({
            ...selections,
            [groupId]: current.filter(id => id !== optionDishId),
          });
        }
      } else {
        if (current.length < maxSel) {
          setSelections({
            ...selections,
            [groupId]: [...current, optionDishId],
          });
        }
      }
    } else {
      setSelections({
        ...selections,
        [groupId]: [optionDishId],
      });
    }
  };

  const handleToggleModifier = (mod: any) => {
    const groupId = mod.ModifierGroupId;
    const maxSel = Number(mod.MaxSelectionCount) || 1;
    const isMulti = Number(mod.MultiselectAllow) === 1 && maxSel > 1;

    const isSelected = selectedModifiers.some((m) => m.ModifierID === mod.ModifierID);
    
    // Get currently selected modifiers belonging to the same group
    const currentGroupSelections = selectedModifiers.filter((m) => m.ModifierGroupId === groupId);

    if (isSelected) {
      // Always allow deselecting
      setSelectedModifiers(selectedModifiers.filter((m) => m.ModifierID !== mod.ModifierID));
    } else {
      if (isMulti) {
        // Multi-select limit check
        if (currentGroupSelections.length < maxSel) {
          setSelectedModifiers([...selectedModifiers, mod]);
        } else {
          Alert.alert("Selection Limit", `You can select up to ${maxSel} option(s) for "${mod.ModifierGroupName || "Modifiers"}".`);
        }
      } else {
        // Single-select: Remove any other modifiers in this group, then add the new one
        const otherGroupsMods = selectedModifiers.filter((m) => m.ModifierGroupId !== groupId);
        setSelectedModifiers([...otherGroupsMods, mod]);
      }
    }
  };

  const calculateTotalPrice = () => {
    if (!dish) return 0;
    const basePrice = Number(dish.Price || 0);
    const modifiersPrice = selectedModifiers.reduce(
      (sum, mod) => sum + Number(mod.Price || 0),
      0
    );

    let comboSurcharge = 0;
    if (comboConfig && comboConfig.groups) {
      comboConfig.groups.forEach((group: any) => {
        const selectedIds = selections[group.comboGroupId] || [];
        const selectedOptions = group.options?.filter((o: any) => selectedIds.includes(o.dishId)) || [];
        selectedOptions.forEach((opt: any) => {
          comboSurcharge += Number(opt.surcharge || 0) + Number(opt.dishPrice || 0);
        });
      });
    }

    return (basePrice + modifiersPrice + comboSurcharge) * quantity;
  };

  const handleAddToCart = async () => {
    if (!dish) return;

    let comboSelectionsList: any[] = [];
    let isCombo = false;
    if (comboConfig && comboConfig.groups) {
      isCombo = true;
      comboSelectionsList = comboConfig.groups.map((group: any) => {
        const selectedIds = selections[group.comboGroupId] || [];
        const selectedOptions = group.options?.filter((o: any) => selectedIds.includes(o.dishId)) || [];
        return {
          groupId: group.comboGroupId,
          groupName: group.groupName,
          items: selectedOptions.map((o: any) => ({
            dishId: o.dishId,
            name: o.name,
            surcharge: Number(o.surcharge || 0),
            dishPrice: Number(o.dishPrice || 0),
            KitchenTypeCode: o.KitchenTypeCode,
            KitchenTypeName: o.KitchenTypeName,
            PrinterIP: o.PrinterIP,
          })),
        };
      });

      for (const group of comboConfig.groups) {
        const selectedIds = selections[group.comboGroupId] || [];
        const effectiveMin = group.options && group.options.length > 0 ? Math.min(group.minSelection, group.options.length) : 0;
        if (selectedIds.length < effectiveMin) {
          Alert.alert("Selection Required", `Please select at least ${effectiveMin} option(s) for "${group.groupName}".`);
          return;
        }
      }
    }

    const cartItemData = {
      id: dish.DishId,
      name: dish.Name,
      price: calculateTotalPrice() / quantity,
      basePrice: Number(dish.Price || 0),
      qty: quantity,
      isCombo: isCombo,
      comboSelections: isCombo ? comboSelectionsList : undefined,
      modifiers: selectedModifiers.map((m) => ({
        ModifierId: m.ModifierID,
        ModifierName: m.ModifierName,
        Price: Number(m.Price || 0),
      })),
      isTakeaway: false,
    };

    const lineItemId = await addToCartGlobal(cartItemData as any);
    if (lineItemId) {
      router.back();
    } else {
      Alert.alert("Error", "Could not add item to cart. Make sure your table is active.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

  if (!dish) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Dish details could not be found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Group modifiers by group name
  const groupedModifiers: Record<string, any[]> = {};
  modifiers.forEach((mod) => {
    const groupName = mod.ModifierGroupName || "Customizations";
    if (!groupedModifiers[groupName]) {
      groupedModifiers[groupName] = [];
    }
    groupedModifiers[groupName].push(mod);
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Cover Photo */}
        <View style={styles.imageContainer}>
          <Image
            source={{
              uri: dish.Image
                ? `${API_URL}/api/menu/image/${dish.Image}`
                : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600",
            }}
            style={styles.coverImage}
          />
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Dish description info */}
        <View style={styles.detailsCard}>
          <Text style={styles.dishName}>{dish.Name}</Text>
          <Text style={styles.dishPrice}>${Number(dish.Price || 0).toFixed(2)}</Text>
          <Text style={styles.dishDesc}>
            {dish.Description || "Delicious and freshly prepared based on our authentic traditional recipe."}
          </Text>
        </View>

        {/* Combo Selection Groups */}
        {comboConfig && comboConfig.groups && comboConfig.groups.map((group: any) => {
          const selectedIds = selections[group.comboGroupId] || [];
          return (
            <View key={group.comboGroupId} style={styles.modifierSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 0, paddingVertical: 0, borderBottomWidth: 0 }]}>{group.groupName}</Text>
                <Text style={styles.selectionLimitsText}>
                  {group.minSelection === group.maxSelection 
                    ? `Select ${group.minSelection}` 
                    : `Select ${group.minSelection} to ${group.maxSelection}`}
                </Text>
              </View>
              
              {/* Combo Options Grid (2 Columns) */}
              <View style={styles.comboGridContainer}>
                {group.options?.map((opt: any) => {
                  const isSelected = selectedIds.includes(opt.dishId);
                  return (
                    <TouchableOpacity
                      key={opt.dishId}
                      style={[styles.comboGridItem, isSelected && styles.comboGridItemActive]}
                      onPress={() => handleSelectOption(
                        group.comboGroupId, 
                        opt.dishId, 
                        group.isMultiSelect, 
                        group.minSelection, 
                        group.maxSelection
                      )}
                    >
                      <View style={styles.comboItemRow}>
                        <Ionicons
                          name={isSelected ? (group.isMultiSelect ? "checkbox" : "radio-button-on") : (group.isMultiSelect ? "square-outline" : "radio-button-off")}
                          size={20}
                          color={isSelected ? Theme.primary : "#94A3B8"}
                          style={{ marginRight: 8 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.comboItemName} numberOfLines={2}>{opt.name}</Text>
                          <Text style={[styles.comboItemSurcharge, { color: Number(opt.surcharge) > 0 ? Theme.primary : "#64748B" }]}>
                            {Number(opt.dishPrice || 0) > 0 
                              ? `$${Number(opt.dishPrice).toFixed(2)} • ${Number(opt.surcharge) > 0 ? `+$${Number(opt.surcharge).toFixed(2)}` : "Included"}`
                              : (Number(opt.surcharge) > 0 ? `+$${Number(opt.surcharge).toFixed(2)}` : "Included")
                            }
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Modifiers List */}
        {Object.keys(groupedModifiers).map((groupName) => {
          const groupItems = groupedModifiers[groupName];
          const firstMod = groupItems[0];
          const minSel = firstMod ? Number(firstMod.MinSelectionCount || 0) : 0;
          const maxSel = firstMod ? Number(firstMod.MaxSelectionCount || 1) : 1;
          const isMulti = firstMod ? (Number(firstMod.MultiselectAllow) === 1 && maxSel > 1) : false;

          return (
            <View key={groupName} style={styles.modifierSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { paddingHorizontal: 0, paddingVertical: 0, borderBottomWidth: 0 }]}>{groupName}</Text>
                <Text style={styles.selectionLimitsText}>
                  {isMulti 
                    ? `Select up to ${maxSel}` 
                    : `Select 1`}
                </Text>
              </View>
              
              <View style={styles.comboGridContainer}>
                {groupItems.map((mod) => {
                  const isSelected = selectedModifiers.some((m) => m.ModifierID === mod.ModifierID);
                  return (
                    <TouchableOpacity
                      key={mod.ModifierID}
                      style={[styles.comboGridItem, isSelected && styles.comboGridItemActive]}
                      onPress={() => handleToggleModifier(mod)}
                    >
                      <View style={styles.comboItemRow}>
                        <Ionicons
                          name={isSelected ? (isMulti ? "checkbox" : "radio-button-on") : (isMulti ? "square-outline" : "radio-button-off")}
                          size={20}
                          color={isSelected ? Theme.primary : "#94A3B8"}
                          style={{ marginRight: 8 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.comboItemName} numberOfLines={2}>{mod.ModifierName}</Text>
                          <Text style={[styles.comboItemSurcharge, { color: Number(mod.Price) > 0 ? Theme.primary : "#64748B" }]}>
                            {Number(mod.Price) > 0 ? `+$${Number(mod.Price).toFixed(2)}` : "Included"}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Footer checkout/quantity actions */}
      <View style={styles.footer}>
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
          >
            <Ionicons name="remove" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(quantity + 1)}>
            <Ionicons name="add" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.addToCartBtn} onPress={handleAddToCart}>
          <Text style={styles.addToCartText}>Add to Cart</Text>
          <Text style={styles.addToCartPrice}>${calculateTotalPrice().toFixed(2)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: "#64748B",
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  scrollContent: {
    paddingBottom: 120,
  },
  imageContainer: {
    height: 260,
    width: "100%",
    position: "relative",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    left: 20,
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  detailsCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
  },
  dishName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0F172A",
  },
  dishPrice: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.primary,
    marginVertical: 6,
  },
  dishDesc: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 6,
    lineHeight: 20,
  },
  modifierSection: {
    backgroundColor: "#fff",
    marginTop: 12,
    paddingVertical: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  selectionLimitsText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modifierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  modName: {
    fontSize: 15,
    color: "#334155",
  },
  modPrice: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
  },
  qtyBtn: {
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  qtyText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
    marginHorizontal: 16,
  },
  addToCartBtn: {
    backgroundColor: Theme.primary,
    flex: 1,
    marginLeft: 16,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  addToCartText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  addToCartPrice: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  comboGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  comboGridItem: {
    width: "48%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },
  comboGridItemActive: {
    borderColor: Theme.primary,
    backgroundColor: "#FFF7ED",
  },
  comboItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  comboItemName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#334155",
  },
  comboItemSurcharge: {
    fontSize: 11,
    color: Theme.primary,
    fontWeight: "600",
    marginTop: 2,
  },
});
