package com.kim.timetable;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
