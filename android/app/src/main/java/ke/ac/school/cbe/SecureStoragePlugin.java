package ke.ac.school.cbe;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/**
 * Native Android Secure Storage Plugin for CBE Hub.
 *
 * Uses AndroidKeyStore with hardware-backed AES-256-GCM encryption at rest.
 * Designed for silent execution without biometric prompts during background token refresh.
 */
@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "cbe_auth_keystore_alias";
    private static final String PREFS_NAME = "cbe_secure_storage";
    private static final String AES_GCM_NOPADDING = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH_BYTES = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;

    private synchronized SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        );
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(false) // Silent access for background token refresh
            .setRandomizedEncryptionRequired(true)
            .build();

        keyGenerator.init(spec);
        return keyGenerator.generateKey();
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) {
            call.reject("Key must not be empty");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String rawBase64 = prefs.getString(key, null);
            if (rawBase64 == null) {
                JSObject ret = new JSObject();
                ret.put("value", JSONObject.NULL);
                call.resolve(ret);
                return;
            }

            byte[] combined = Base64.decode(rawBase64, Base64.NO_WRAP);
            if (combined == null || combined.length < (1 + GCM_IV_LENGTH_BYTES)) {
                // Corrupted payload: clean up stale entry and return null safely
                prefs.edit().remove(key).apply();
                JSObject ret = new JSObject();
                ret.put("value", JSONObject.NULL);
                call.resolve(ret);
                return;
            }

            int ivLength = combined[0] & 0xFF;
            if (ivLength != GCM_IV_LENGTH_BYTES || combined.length <= (1 + ivLength)) {
                prefs.edit().remove(key).apply();
                JSObject ret = new JSObject();
                ret.put("value", JSONObject.NULL);
                call.resolve(ret);
                return;
            }

            byte[] iv = Arrays.copyOfRange(combined, 1, 1 + ivLength);
            byte[] ciphertext = Arrays.copyOfRange(combined, 1 + ivLength, combined.length);

            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(AES_GCM_NOPADDING);
            GCMParameterSpec gcmSpec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec);

            byte[] decryptedBytes = cipher.doFinal(ciphertext);
            String decryptedValue = new String(decryptedBytes, StandardCharsets.UTF_8);

            JSObject ret = new JSObject();
            ret.put("value", decryptedValue);
            call.resolve(ret);
        } catch (Exception e) {
            // Controlled error recovery: never crash, never expose token secrets
            JSObject ret = new JSObject();
            ret.put("value", JSONObject.NULL);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.trim().isEmpty()) {
            call.reject("Key must not be empty");
            return;
        }
        if (value == null) {
            call.reject("Value must not be null");
            return;
        }

        try {
            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(AES_GCM_NOPADDING);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);

            byte[] iv = cipher.getIV();
            if (iv == null || iv.length != GCM_IV_LENGTH_BYTES) {
                call.reject("Failed to generate cryptographic IV");
                return;
            }

            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));

            // Structured payload: [1 byte ivLength] + [iv] + [ciphertext]
            byte[] combined = new byte[1 + iv.length + ciphertext.length];
            combined[0] = (byte) iv.length;
            System.arraycopy(iv, 0, combined, 1, iv.length);
            System.arraycopy(ciphertext, 0, combined, 1 + iv.length, ciphertext.length);

            String storedBase64 = Base64.encodeToString(combined, Base64.NO_WRAP);

            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(key, storedBase64).apply();

            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Encryption failed: " + e.getClass().getSimpleName());
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) {
            call.reject("Key must not be empty");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().remove(key).apply();

            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Removal failed: " + e.getClass().getSimpleName());
        }
    }
}
