package com.base6a5340f43f8fd031c5921680.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AxisFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
