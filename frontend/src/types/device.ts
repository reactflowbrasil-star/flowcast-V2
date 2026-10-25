// Device management types based on backend API requirements

export interface Device {
  id: number;
  user_id: number;
  device_id: string;
  device_name: string;
  last_active: string;
  created_at: string;
}

export interface RegisterDeviceRequest {
  device_id: string;
  device_name: string;
}

export interface DeviceResponse {
  id: number;
  user_id: number;
  device_id: string;
  device_name: string;
  last_active: string;
  created_at: string;
}

export interface DeviceConnectionCheck {
  can_connect: boolean;
  device_count: number;
  max_devices: number;
}
