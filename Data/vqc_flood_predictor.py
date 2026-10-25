# ============================================
# Phase 3: VQC Flood Risk Predictor
# Belagavi District - Q-Rescue Project
# ============================================

import pandas as pd
import numpy as np
import pennylane as qml
import pickle
import warnings

from sklearn.preprocessing import LabelEncoder, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

warnings.filterwarnings("ignore")


# ============================================
# STEP 1: Load NASA Weather Data
# ============================================

print("\n" + "=" * 60)
print("Q-RESCUE | PHASE 3")
print("Variational Quantum Classifier")
print("=" * 60)

print("\n📂 Loading Belagavi rainfall data...")

df = pd.read_csv("Data/belagavi_rainfall_2015_2023.csv")

print(f"✅ Loaded {len(df)} days of data")

print("\nFirst 5 rows:")
print(df.head())


# ============================================
# STEP 2: Generate Prototype Flood Labels
# ============================================

print("\n🏷️ Generating flood-risk labels...")

def label_flood_risk(row):

    rainfall = row["rainfall_mm"]
    humidity = row["humidity_%"]

    if rainfall > 100:
        return "Critical"

    elif rainfall > 50 and humidity > 80:
        return "Critical"

    elif rainfall > 50:
        return "High"

    elif rainfall > 20 and humidity > 75:
        return "High"

    elif rainfall > 20:
        return "Medium"

    else:
        return "Low"


df["flood_risk"] = df.apply(label_flood_risk, axis=1)


print("\n📊 Flood Risk Distribution:")
print(df["flood_risk"].value_counts())


# ============================================
# STEP 3: Prepare Data
# ============================================

print("\n⚙️ Preparing data for VQC...")


features = [
    "rainfall_mm",
    "temperature_c",
    "humidity_%",
    "wind_speed"
]

X = df[features].values

y = df["flood_risk"].values


# Encode classes
encoder = LabelEncoder()

y_encoded = encoder.fit_transform(y)

print("\nClasses:")
for i, class_name in enumerate(encoder.classes_):
    print(f"{i} → {class_name}")


# Scale features to [0, 1]
scaler = MinMaxScaler()

X_scaled = scaler.fit_transform(X)


# Train/test split
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled,
    y_encoded,
    test_size=0.2,
    random_state=42,
    stratify=y_encoded
)


print(f"\n✅ Training samples: {len(X_train)}")
print(f"✅ Testing samples:  {len(X_test)}")


# ============================================
# STEP 4: Build Quantum Circuit
# ============================================

print("\n🔬 Building Quantum Circuit...")


# Four features → four qubits
n_qubits = 4

# Number of variational layers
n_layers = 2


# Quantum simulator
dev = qml.device(
    "default.qubit",
    wires=n_qubits
)


@qml.qnode(dev)
def vqc_circuit(inputs, weights):

    # ----------------------------------------
    # Feature Encoding
    # ----------------------------------------

    for i in range(n_qubits):

        qml.RY(
            inputs[i] * np.pi,
            wires=i
        )


    # ----------------------------------------
    # Variational Layers
    # ----------------------------------------

    for layer in range(n_layers):

        # Trainable rotations
        for i in range(n_qubits):

            qml.RY(
                weights[layer, i, 0],
                wires=i
            )

            qml.RZ(
                weights[layer, i, 1],
                wires=i
            )


        # Entanglement
        for i in range(n_qubits - 1):

            qml.CNOT(
                wires=[i, i + 1]
            )


    # Measure every qubit
    return [
        qml.expval(qml.PauliZ(i))
        for i in range(n_qubits)
    ]


print("✅ Quantum circuit built!")


print("\nQuantum Circuit:")

print(
    qml.draw(vqc_circuit)(
        X_train[0],
        np.zeros((n_layers, n_qubits, 2))
    )
)


# ============================================
# STEP 5: VQC Prediction
# ============================================

# The actual dataset currently produces:
#
# 0 → Critical
# 1 → High
# 2 → Low
#
# Therefore we dynamically support the number
# of classes instead of assuming 4.


n_classes = len(encoder.classes_)

print(f"\nNumber of classes: {n_classes}")


# Create evenly spaced target values.
#
# Example for 3 classes:
#
# Critical → -1
# High     →  0
# Low      →  1

class_targets = np.linspace(
    -1,
    1,
    n_classes
)


def predict_single(x, weights):

    outputs = np.array(
        vqc_circuit(x, weights)
    )

    # Average measurement results
    score = outputs.mean()

    # Find closest class target
    class_index = int(
        np.argmin(
            np.abs(class_targets - score)
        )
    )

    return class_index


# ============================================
# STEP 6: Accuracy Function
# ============================================

def compute_accuracy(X_data, y_data, weights):

    predictions = []

    for x in X_data:

        predictions.append(
            predict_single(x, weights)
        )

    predictions = np.array(predictions)

    return accuracy_score(
        y_data,
        predictions
    )


# ============================================
# STEP 7: Train VQC
# ============================================

print("\n" + "=" * 60)
print("🏋️ TRAINING VQC")
print("=" * 60)

print("\nQuantum simulation training started...")
print("This may take a few minutes.")


np.random.seed(42)


# Initialize trainable quantum parameters
weights = (
    np.random.randn(
        n_layers,
        n_qubits,
        2
    ) * 0.1
)


learning_rate = 0.05

n_epochs = 15

batch_size = 32


# Finite-difference step
shift_value = 0.05


for epoch in range(n_epochs):

    # Random batch
    batch_size_actual = min(
        batch_size,
        len(X_train)
    )

    indices = np.random.choice(
        len(X_train),
        batch_size_actual,
        replace=False
    )


    X_batch = X_train[indices]

    y_batch = y_train[indices]


    total_loss = 0.0


    # ----------------------------------------
    # Calculate gradient
    # ----------------------------------------

    gradients = np.zeros_like(weights)


    for x, y_true in zip(
        X_batch,
        y_batch
    ):

        # Current output
        outputs = np.array(
            vqc_circuit(
                x,
                weights
            )
        )


        score = outputs.mean()


        target = class_targets[y_true]


        # Mean squared error
        sample_loss = (
            score - target
        ) ** 2


        total_loss += sample_loss


        # ------------------------------------
        # Finite difference gradient
        # ------------------------------------

        for layer in range(n_layers):

            for qubit in range(n_qubits):

                for parameter in range(2):

                    weights_plus = weights.copy()

                    weights_minus = weights.copy()


                    weights_plus[
                        layer,
                        qubit,
                        parameter
                    ] += shift_value


                    weights_minus[
                        layer,
                        qubit,
                        parameter
                    ] -= shift_value


                    output_plus = np.array(
                        vqc_circuit(
                            x,
                            weights_plus
                        )
                    ).mean()


                    output_minus = np.array(
                        vqc_circuit(
                            x,
                            weights_minus
                        )
                    ).mean()


                    derivative = (
                        output_plus -
                        output_minus
                    ) / (
                        2 * shift_value
                    )


                    # d(loss)/d(parameter)
                    gradient = (
                        2 *
                        (score - target) *
                        derivative
                    )


                    gradients[
                        layer,
                        qubit,
                        parameter
                    ] += gradient


    # ----------------------------------------
    # Update parameters
    # ----------------------------------------

    gradients /= batch_size_actual


    weights -= (
        learning_rate *
        gradients
    )


    # ----------------------------------------
    # Display progress
    # ----------------------------------------

    if (
        epoch == 0
        or
        (epoch + 1) % 5 == 0
    ):

        train_accuracy = compute_accuracy(
            X_train[:300],
            y_train[:300],
            weights
        )


        print(
            f"Epoch {epoch + 1:02d}/{n_epochs} "
            f"| Loss: {total_loss / batch_size_actual:.4f} "
            f"| Accuracy: {train_accuracy * 100:.2f}%"
        )


# ============================================
# STEP 8: Evaluate VQC
# ============================================

print("\n" + "=" * 60)
print("📊 VQC MODEL EVALUATION")
print("=" * 60)


test_predictions = []


for x in X_test:

    prediction = predict_single(
        x,
        weights
    )

    test_predictions.append(
        prediction
    )


test_predictions = np.array(
    test_predictions
)


test_accuracy = accuracy_score(
    y_test,
    test_predictions
)


print(
    f"\n✅ Test Accuracy: "
    f"{test_accuracy * 100:.2f}%"
)


print("\nClassification Report:")

print(
    classification_report(
        y_test,
        test_predictions,
        target_names=encoder.classes_,
        zero_division=0
    )
)


# ============================================
# STEP 9: Predict Belagavi Zones
# ============================================

print("\n" + "=" * 60)
print("🌊 BELAGAVI FLOOD RISK PREDICTIONS")
print("=" * 60)


zones_df = pd.read_csv(
    "Data/belagavi_flood_zones.csv"
)


emojis = {

    "Critical": "🔴",

    "High": "🟠",

    "Medium": "🟡",

    "Low": "🟢"
}


# --------------------------------------------
# IMPORTANT
#
# At this stage we don't have individual
# weather readings for each taluk.
#
# Therefore we use a representative weather
# scenario for demonstration.
#
# Later we will replace this with:
#
# weather + geographic + satellite data
# for every zone.
# --------------------------------------------


sample_weather = np.array([
    [
        75.0,   # rainfall
        27.5,   # temperature
        85.0,   # humidity
        2.5     # wind speed
    ]
])


sample_scaled = scaler.transform(
    sample_weather
)


predicted_index = predict_single(
    sample_scaled[0],
    weights
)


predicted_risk = encoder.classes_[
    predicted_index
]


print("\nCurrent representative prediction:")

print(
    f"{emojis.get(predicted_risk, '⚪')} "
    f"Risk Level: {predicted_risk}"
)


print("\nZone-wise analysis:")

for _, zone in zones_df.iterrows():

    print(
        f"{zone['taluk']:<15} | "
        f"River: {zone['river']:<12} | "
        f"Population: {int(zone['population']):<7} | "
        f"Risk: {predicted_risk}"
    )


# ============================================
# STEP 10: Save VQC Model
# ============================================

model_data = {

    "weights": weights,

    "scaler": scaler,

    "encoder": encoder,

    "features": features,

    "n_qubits": n_qubits,

    "n_layers": n_layers,

    "class_targets": class_targets
}


with open(
    "Data/vqc_model.pkl",
    "wb"
) as f:

    pickle.dump(
        model_data,
        f
    )


print("\n" + "=" * 60)

print(
    "💾 VQC model saved:"
)

print(
    "Data/vqc_model.pkl"
)

print(
    "\n✅ PHASE 3 COMPLETE!"
)

print(
    "Next phase → QAOA Resource Allocation"
)

print("=" * 60)