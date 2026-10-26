package ke.ac.school.cbe;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);

        registerPlugin(SecureStoragePlugin.class);
        registerPlugin(BiometricPlugin.class);

        super.onCreate(savedInstanceState);
    }
}
