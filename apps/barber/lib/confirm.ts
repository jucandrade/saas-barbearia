import { Alert, Platform } from "react-native";

/** Asks the owner to confirm an action that cannot be undone from the app. */
export function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm(`${title}\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => {
            resolve(false);
          },
        },
        {
          text: "Confirmar",
          style: "destructive",
          onPress: () => {
            resolve(true);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve(false);
        },
      },
    );
  });
}
