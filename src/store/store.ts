import { configureStore } from "@reduxjs/toolkit";
import demandReducer from "./slice/demandApiSlice";
import supplyReducer from "./slice/supplyApiSlice";
import marketReducer from "./slice/marketApiSlice";
import tuneupReducer from "./slice/tuneupApiSlice";

export const store = configureStore({
    reducer: {
        demand: demandReducer,
        supply: supplyReducer,
        market: marketReducer,
        tuneup: tuneupReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;