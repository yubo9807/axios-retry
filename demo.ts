import axios, { AxiosStatic, AxiosRequestConfig } from 'axios';
import axiosRetry from './axios-retry';
import env from '~/config/env';
import { message, notification } from 'antd';
import { getCookie, isClient } from '@/utils/browser';

const config: AxiosRequestConfig = {
  baseURL: env.BASE_API,
  timeout: 2000,
  // withCredentials: true,  // 跨域
};

const instance = axios.create(config);
axiosRetry(instance, {
  retries: 3,
  retryDelay: 2000,
  retryTips: () => isClient() && message.info('网络可能在开小差，正在请求重试')
});

// 响应拦截器
instance.interceptors.response.use((response: any) => {

  const { status, data } = response;

  // 与后端协商 code 码
  if (status) {
    unifiedError(response);
    return data;
  }
  
  return response;
}, error => {
  const { response } = error;
  
  // 响应出现错误（连接超时/网络断开/服务器忙没响应）
  if (!response) {
    isClient() && notification.open({
      message: '服务器连接错误',
      description: '错误原因：连接超时/网络断开/服务器忙没响应',
    })

    // 返回统一数据格式，不会导致代码取不到 code 而报错
    return Promise.resolve({
      code: 500,
      msg: error.message || 'network error',
    });
  } else {
    const { status } = response;
    
    // 与后端协商 code 码
    if (status) {
      unifiedError(response);
      return Promise.resolve(response.data);;
    }
    
    // 不需要 axios-retry 时直接将数据返回
    return Promise.resolve(response);
  }
  
});

// 请求拦截器
instance.interceptors.request.use(async(config) => {
  
  // 有 token 的话将其放在 headers 中
  const authorization = isClient() && await getCookie('token');
  if (authorization) {
    config.headers.Authorization = authorization;
  }
  return config;
})

interface SateConfig extends AxiosRequestConfig {
  noTips?: boolean
}
interface SateAxios extends AxiosStatic {
  (config?: SateConfig)
}

export default (instance as SateAxios);

/**
 * 统一报错
 * @param data
 * @param config 
 */
function unifiedError(response) {
  if (!isClient()) return;
  const { data, config } = response;
  if (data.code >= 400 && data.code < 500) {  // 错误报给前端开发者
    console.error(Object.assign(data, { url: config.url }));
  } else if (data.code >= 500 && !config.noTips) {  // 报给用户的错
    message.error(data.msg);
  }
}