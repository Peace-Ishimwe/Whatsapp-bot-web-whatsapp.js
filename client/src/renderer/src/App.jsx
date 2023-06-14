/* eslint-disable no-unused-vars */
import React, { useState } from 'react'
import axios from 'axios'
import QRCode from 'qrcode.react'

const App = () => {
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState('')
  const [msg, setMessage] = useState('')
  const [qrcode, setQRCode] = useState(false)

  const getQRCode = async () => {
    setLoading(true)
    const res = await axios.post('http://localhost:5000/api', { phone, msg })
    setQRCode(res.data)
    setLoading(false)
  }

  return (
    <div>
      <div className="container">
        <h1 style={{ textAlign: 'center' }}>Whatsapp Message Sender</h1>
        <input
          id="phone"
          className="form-control"
          placeholder="phone e.g: +250785304805"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <textarea
          id="message"
          className="form-control"
          placeholder="message"
          value={msg}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="btn" type="submit" onClick={getQRCode}>
          Get QRCode
        </button>
        {!loading && qrcode && (
          <div className="qrcode-container">
            <QRCode value={qrcode} />
          </div>
        )}
        {loading && <div className="loading-text">Waiting for QRCode...</div>}
      </div>
    </div>
  )
}

export default App
