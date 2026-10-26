package ke.ac.school.cbe;

import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Native Android Biometric Plugin for CBE Hub.
 *
 * Provides a local access gate using AndroidX BiometricPrompt.
 * Does NOT store or handle biometric data, templates, or images.
 * Completely decoupled from Supabase background token refresh.
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_STRONG |
        BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            BiometricManager biometricManager = BiometricManager.from(getContext());
            int canAuthenticate = biometricManager.canAuthenticate(AUTHENTICATORS);

            JSObject ret = new JSObject();
            switch (canAuthenticate) {
                case BiometricManager.BIOMETRIC_SUCCESS:
                    ret.put("isAvailable", true);
                    ret.put("hasHardware", true);
                    ret.put("isEnrolled", true);
                    ret.put("status", "AVAILABLE");
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                    ret.put("isAvailable", false);
                    ret.put("hasHardware", false);
                    ret.put("isEnrolled", false);
                    ret.put("status", "NO_HARDWARE");
                    break;
                case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                    ret.put("isAvailable", false);
                    ret.put("hasHardware", true);
                    ret.put("isEnrolled", false);
                    ret.put("status", "HARDWARE_UNAVAILABLE");
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                    ret.put("isAvailable", false);
                    ret.put("hasHardware", true);
                    ret.put("isEnrolled", false);
                    ret.put("status", "NOT_ENROLLED");
                    break;
                default:
                    ret.put("isAvailable", false);
                    ret.put("hasHardware", false);
                    ret.put("isEnrolled", false);
                    ret.put("status", "UNSUPPORTED");
                    break;
            }
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("isAvailable", false);
            ret.put("hasHardware", false);
            ret.put("isEnrolled", false);
            ret.put("status", "UNSUPPORTED");
            ret.put("error", e.getMessage() != null ? e.getMessage() : "Availability check failed");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("status", "ERROR");
            ret.put("error", "Host activity is not a FragmentActivity");
            call.resolve(ret);
            return;
        }

        final FragmentActivity activity = (FragmentActivity) getActivity();
        final String title = call.getString("title", "Fingerprint Sign In");
        final String subtitle = call.getString("subtitle", "Verify your fingerprint to access CBE Hub");
        final String negativeButtonText = call.getString("negativeButtonText", "Use Password Instead");

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Executor executor = ContextCompat.getMainExecutor(getContext());

                BiometricPrompt.AuthenticationCallback callback = new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("status", "SUCCESS");
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                            ret.put("status", "CANCELLED");
                            ret.put("error", "Cancelled by user");
                        } else {
                            ret.put("status", "ERROR");
                            ret.put("error", errString.toString());
                        }
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                        // BiometricPrompt UI keeps prompt open for user retry
                    }
                };

                BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor, callback);

                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText(negativeButtonText)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .build();

                biometricPrompt.authenticate(promptInfo);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("status", "ERROR");
                ret.put("error", e.getMessage() != null ? e.getMessage() : "Failed to display BiometricPrompt");
                call.resolve(ret);
            }
        });
    }
}
